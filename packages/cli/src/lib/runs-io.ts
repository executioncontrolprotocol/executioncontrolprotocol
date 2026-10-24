import { readdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { join } from "node:path"
import type { Interfaces } from "@oclif/core"
import { findStep, flattenStepOrder, type RunOptions } from "@executioncontrolprotocol/core"
import {
  ECP_RERUN_INCOMPATIBLE,
  EcpError,
  type JournalRunDocument,
  type JournalStepDocument,
  type RunApproval,
  type StepRunRecord,
  type WorkflowManifest,
} from "@executioncontrolprotocol/core/types"
import {
  hashStepDefinition,
  listRunJournals,
  readRunJournal,
  readStepJournal,
  runDir,
  runsRoot,
} from "@executioncontrolprotocol/node"
import { EcpCliError, EXIT_USAGE } from "@executioncontrolprotocol/plugin-sdk"

/**
 * SHA-256 of a workflow file's bytes.
 * @category CLI
 */
export function hashWorkflowSource(source: string): string {
  return createHash("sha256").update(source).digest("hex")
}

/**
 * Installed plugin versions from the oclif config.
 * @category CLI
 */
export function pluginVersions(config: Interfaces.Config): Record<string, string> {
  const out: Record<string, string> = {}
  for (const plugin of config.getPluginsList()) {
    if (plugin.version) out[plugin.name] = plugin.version
  }
  return out
}

async function loadStepDocs(runId: string): Promise<JournalStepDocument[]> {
  const dir = runDir(runId)
  let names: string[]
  try {
    names = await readdir(joinSteps(dir))
  } catch {
    return []
  }
  const docs: JournalStepDocument[] = []
  for (const name of names) {
    if (!name.endsWith(".json")) continue
    docs.push(await readStepJournal(runId, name.replace(/\.json$/, "")))
  }
  return docs
}

function joinSteps(dir: string): string {
  return join(dir, "steps")
}

function restoredHistory(
  workflow: WorkflowManifest,
  steps: JournalStepDocument[],
  beforeStepId?: string
): { history: Record<string, StepRunRecord>; state: Record<string, unknown> } {
  const order = flattenStepOrder(workflow.steps)
  const cut = beforeStepId ? order.findIndex((s) => s.id === beforeStepId) : order.length
  const history: Record<string, StepRunRecord> = {}
  let state: Record<string, unknown> = {}
  for (let i = 0; i < cut; i++) {
    const step = order[i]!
    const doc = steps.find((s) => s.stepId === step.id && s.status === "completed")
    if (!doc) continue
    history[step.id] = {
      status: "completed",
      output: doc.output,
    }
    if (doc.committedState && typeof doc.committedState === "object") {
      state = { ...(doc.committedState as Record<string, unknown>) }
    }
  }
  return { history, state }
}

function assertCompatible(
  workflow: WorkflowManifest,
  steps: JournalStepDocument[],
  restoredIds: string[]
): void {
  for (const id of restoredIds) {
    const current = findStep(workflow, id)
    const recorded = steps.find((s) => s.stepId === id)
    if (!current || !recorded) {
      throw new EcpError(
        ECP_RERUN_INCOMPATIBLE,
        `Step ${id} cannot be restored from the journal`,
        { suggestions: ["Run the workflow from the start", "Use an earlier --from"] }
      )
    }
    if (recorded.definitionHash && recorded.definitionHash !== hashStepDefinition(current)) {
      throw new EcpError(
        ECP_RERUN_INCOMPATIBLE,
        `Step ${id} changed since the journal was written`,
        { suggestions: ["Run the workflow from the start", `Use --from before ${id}`] }
      )
    }
  }
}

/**
 * Build resume/rerun `ecp.run` options from a parent journal.
 * @category CLI
 */
export async function runOptionsFromJournal(options: {
  parent: JournalRunDocument
  workflow: WorkflowManifest
  fromStepId?: string
  toStepId?: string
  approve?: boolean
  mode: "resume" | "rerun"
}): Promise<Pick<
  RunOptions,
  | "seedState"
  | "seedHistory"
  | "stopAfterStepId"
  | "onlyStepId"
  | "approvals"
  | "input"
>> {
  const steps = await loadStepDocs(options.parent.runId)
  if (options.mode === "resume") {
    if (options.parent.status !== "stopped" && options.parent.status !== "paused") {
      throw new EcpCliError(
        "ECP_INPUT_INVALID",
        `Run ${options.parent.runId} is ${options.parent.status}; resume needs stopped or paused`,
        { exitCode: EXIT_USAGE }
      )
    }
    const restoredIds = flattenStepOrder(options.workflow.steps)
      .filter((s) => steps.some((d) => d.stepId === s.id && d.status === "completed"))
      .map((s) => s.id)
    assertCompatible(options.workflow, steps, restoredIds)
    const { history, state } = restoredHistory(options.workflow, steps)
    const pausedStepId =
      options.parent.cursor ??
      steps.find((s) => s.status === "paused")?.stepId ??
      restoredIds[restoredIds.length - 1] ??
      ""
    const approvals: RunApproval[] | undefined = options.approve
      ? [
          {
            stepId: pausedStepId,
            approvedBy: "cli",
            at: new Date().toISOString(),
          },
        ]
      : options.parent.approvals
    return {
      input: options.parent.input,
      seedState: state,
      seedHistory: history,
      stopAfterStepId: options.toStepId,
      approvals,
    }
  }

  const order = flattenStepOrder(options.workflow.steps)
  const fromId =
    options.fromStepId ??
    order.find((s) => steps.find((d) => d.stepId === s.id)?.status === "failed")?.id
  if (!fromId) {
    throw new EcpCliError("ECP_INPUT_INVALID", "No failed step to rerun; pass --from", {
      exitCode: EXIT_USAGE,
    })
  }
  if (!findStep(options.workflow, fromId)) {
    throw new EcpCliError("ECP_INPUT_INVALID", `Unknown step id: ${fromId}`, {
      exitCode: EXIT_USAGE,
    })
  }
  const restoredIds = order
    .slice(
      0,
      order.findIndex((s) => s.id === fromId)
    )
    .map((s) => s.id)
  assertCompatible(options.workflow, steps, restoredIds)
  const { history, state } = restoredHistory(options.workflow, steps, fromId)
  const only = options.toStepId && options.toStepId === fromId ? fromId : undefined
  return {
    input: options.parent.input,
    seedState: state,
    seedHistory: history,
    stopAfterStepId: only ? undefined : options.toStepId,
    onlyStepId: only,
  }
}

export { listRunJournals, readRunJournal, readStepJournal, runsRoot }

/** Re-export for tests. @category CLI */
export async function loadParentRun(runId: string): Promise<JournalRunDocument> {
  try {
    return await readRunJournal(runId)
  } catch {
    throw new EcpCliError("ECP_INPUT_INVALID", `Unknown run id: ${runId}`, {
      exitCode: EXIT_USAGE,
    })
  }
}
