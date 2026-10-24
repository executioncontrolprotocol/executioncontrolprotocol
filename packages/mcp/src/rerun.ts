import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { findStep, flattenStepOrder, type RunOptions } from "@executioncontrolprotocol/core"
import {
  ECP_INPUT_INVALID,
  ECP_RERUN_INCOMPATIBLE,
  EcpError,
  type JournalRunDocument,
  type JournalStepDocument,
  type StepRunRecord,
  type WorkflowManifest,
} from "@executioncontrolprotocol/core/types"
import {
  hashStepDefinition,
  readRunJournal,
  readStepJournal,
  runDir,
} from "@executioncontrolprotocol/node"

async function loadStepDocs(runId: string): Promise<JournalStepDocument[]> {
  const dir = runDir(runId)
  let names: string[]
  try {
    names = await readdir(join(dir, "steps"))
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
    history[step.id] = { status: "completed", output: doc.output }
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
        { suggestions: ["Run the workflow from the start", "Use an earlier from step"] }
      )
    }
    if (recorded.definitionHash && recorded.definitionHash !== hashStepDefinition(current)) {
      throw new EcpError(
        ECP_RERUN_INCOMPATIBLE,
        `Step ${id} changed since the journal was written`,
        { suggestions: ["Run the workflow from the start", `Use from before ${id}`] }
      )
    }
  }
}

/**
 * Load `run.json` or throw {@link ECP_INPUT_INVALID}.
 * @category MCP
 */
export async function loadParentRun(runId: string): Promise<JournalRunDocument> {
  try {
    return await readRunJournal(runId)
  } catch {
    throw new EcpError(ECP_INPUT_INVALID, `Unknown run id: ${runId}`, {
      suggestions: ["Call ecp_runs_show with a journal id from ecp_run"],
    })
  }
}

/**
 * Build `ecp.run` options that restore steps before `from`.
 * @category MCP
 */
export async function rerunOptionsFromJournal(options: {
  parent: JournalRunDocument
  workflow: WorkflowManifest
  fromStepId?: string
  toStepId?: string
}): Promise<Pick<RunOptions, "seedState" | "seedHistory" | "stopAfterStepId" | "onlyStepId" | "input">> {
  const steps = await loadStepDocs(options.parent.runId)
  const order = flattenStepOrder(options.workflow.steps)
  const fromId =
    options.fromStepId ??
    order.find((s) => steps.find((d) => d.stepId === s.id)?.status === "failed")?.id
  if (!fromId) {
    throw new EcpError(ECP_INPUT_INVALID, "No failed step to rerun; pass from", {
      suggestions: ["Pass from with a step id"],
    })
  }
  if (!findStep(options.workflow, fromId)) {
    throw new EcpError(ECP_INPUT_INVALID, `Unknown step id: ${fromId}`)
  }
  const restoredIds = order.slice(0, order.findIndex((s) => s.id === fromId)).map((s) => s.id)
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
