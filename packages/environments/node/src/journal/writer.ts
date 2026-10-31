import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { findStep, type LifecycleContext } from "@executioncontrolprotocol/core"
import {
  JOURNAL_VERSION,
  type JournalError,
  type JournalRunDocument,
  type JournalStepDocument,
  type PolicyJournalDecision,
  type RunStatus,
  type ValidationIssue,
} from "@executioncontrolprotocol/core/types"
import { hashStepDefinition } from "./hash.js"
import { redactSecrets } from "./redact.js"
import { runDir, runsRoot } from "./paths.js"

interface OpenRun {
  dir: string
  startedAt: string
  document: JournalRunDocument
}

const openRuns = new Map<string, OpenRun>()

function journalErrorFrom(
  diagnostic: ValidationIssue | undefined,
  stepId?: string
): JournalError | undefined {
  if (!diagnostic) return undefined
  const redacted = redactSecrets(diagnostic)
  return {
    ...(redacted.code !== undefined ? { code: redacted.code } : {}),
    message: redacted.message,
    ...(redacted.details ? { details: redacted.details } : {}),
    ...(stepId ? { stepId } : {}),
  }
}

/**
 * Start a journal for `run:before` / `run:started`.
 * @category Journal
 */
export async function journalRunStart(ctx: LifecycleContext): Promise<void> {
  const dir = runDir(ctx.run.id, ctx.journal?.directory)
  await mkdir(join(dir, "steps"), { recursive: true })
  const startedAt = new Date().toISOString()
  const document: JournalRunDocument = {
    journalVersion: JOURNAL_VERSION,
    runId: ctx.run.id,
    workflowPath: ctx.journal?.workflowPath,
    workflowHash: ctx.journal?.workflowHash,
    environmentId: ctx.journal?.environmentId ?? "@executioncontrolprotocol/node",
    pluginVersions: ctx.journal?.pluginVersions,
    input: redactSecrets(ctx.run.input ?? {}),
    status: "started",
    startedAt,
    parentRunId: ctx.journal?.parentRunId,
    resumedFrom: ctx.journal?.resumedFrom,
    approvals: ctx.approvals,
  }
  openRuns.set(ctx.run.id, { dir, startedAt, document })
  await writeFile(join(dir, "run.json"), `${JSON.stringify(document, null, 2)}\n`, "utf8")
}

/**
 * Write a step journal file from a step lifecycle event.
 * @category Journal
 */
export async function journalStep(ctx: LifecycleContext, status: RunStatus): Promise<void> {
  const open = openRuns.get(ctx.run.id)
  if (!open || !ctx.step) return
  const stepNode = findStep(ctx.workflow, ctx.step.id)
  const startedAt = new Date().toISOString()
  const diagnostics = ctx.diagnostics ? redactSecrets(ctx.diagnostics) : undefined
  const document: JournalStepDocument = {
    stepId: ctx.step.id,
    capabilityId: ctx.step.capabilityId,
    definitionHash: stepNode ? hashStepDefinition(stepNode) : "",
    input: ctx.resolvedInput ? redactSecrets(ctx.resolvedInput) : undefined,
    output: ctx.output !== undefined ? redactSecrets(ctx.output) : undefined,
    policyDecisions: ctx.policyDecisions as PolicyJournalDecision[] | undefined,
    stagedMutations: ctx.pendingMutations,
    committedState: redactSecrets(ctx.state),
    attempts: 1,
    startedAt,
    endedAt: new Date().toISOString(),
    status,
    error: journalErrorFrom(diagnostics?.[0]),
    diagnostics,
  }
  await writeFile(
    join(open.dir, "steps", `${ctx.step.id}.json`),
    `${JSON.stringify(document, null, 2)}\n`,
    "utf8"
  )
  open.document.cursor = ctx.step.id
}

/**
 * Finish `run.json` on `run:finally`.
 * @category Journal
 */
export async function journalRunEnd(ctx: LifecycleContext): Promise<void> {
  const open = openRuns.get(ctx.run.id)
  if (!open) return
  open.document.status = ctx.status ?? open.document.status
  open.document.endedAt = new Date().toISOString()
  const stepId = ctx.step?.id ?? open.document.cursor
  if (ctx.diagnostics?.[0]) {
    open.document.error = journalErrorFrom(ctx.diagnostics[0], stepId)
  }
  await writeFile(
    join(open.dir, "run.json"),
    `${JSON.stringify(open.document, null, 2)}\n`,
    "utf8"
  )
  openRuns.delete(ctx.run.id)
}

/**
 * Write a one-step journal for a generated capability command.
 * @category Journal
 */
export async function writeInvokeJournal(entry: {
  capabilityId: string
  input: unknown
  result: unknown
  success: boolean
  diagnostics?: ValidationIssue[]
}): Promise<string> {
  const runId = globalThis.crypto.randomUUID()
  const dir = runDir(runId)
  await mkdir(join(dir, "steps"), { recursive: true })
  const startedAt = new Date().toISOString()
  const status: RunStatus = entry.success ? "completed" : "failed"
  const diagnostics = entry.diagnostics ? redactSecrets(entry.diagnostics) : undefined
  const error = journalErrorFrom(diagnostics?.[0], "invoke")
  const runDoc: JournalRunDocument = {
    journalVersion: JOURNAL_VERSION,
    runId,
    environmentId: "@executioncontrolprotocol/node",
    input: redactSecrets(
      entry.input && typeof entry.input === "object"
        ? (entry.input as Record<string, unknown>)
        : { value: entry.input }
    ),
    status,
    startedAt,
    endedAt: new Date().toISOString(),
    cursor: "invoke",
    ...(error ? { error } : {}),
  }
  const stepDoc: JournalStepDocument = {
    stepId: "invoke",
    capabilityId: entry.capabilityId,
    definitionHash: "",
    input: redactSecrets(
      entry.input && typeof entry.input === "object"
        ? (entry.input as Record<string, unknown>)
        : { value: entry.input }
    ),
    output: entry.result !== undefined ? redactSecrets(entry.result) : undefined,
    attempts: 1,
    startedAt,
    endedAt: new Date().toISOString(),
    status,
    ...(error ? { error } : {}),
    diagnostics,
  }
  await writeFile(join(dir, "run.json"), `${JSON.stringify(runDoc, null, 2)}\n`, "utf8")
  await writeFile(join(dir, "steps", "invoke.json"), `${JSON.stringify(stepDoc, null, 2)}\n`, "utf8")
  return runId
}

/**
 * Load `run.json` for a run id.
 * @category Journal
 */
export async function readRunJournal(
  runId: string,
  directory?: string
): Promise<JournalRunDocument> {
  const raw = await readFile(join(runDir(runId, directory), "run.json"), "utf8")
  return JSON.parse(raw) as JournalRunDocument
}

/**
 * Load one step journal.
 * @category Journal
 */
export async function readStepJournal(
  runId: string,
  stepId: string,
  directory?: string
): Promise<JournalStepDocument> {
  const raw = await readFile(join(runDir(runId, directory), "steps", `${stepId}.json`), "utf8")
  return JSON.parse(raw) as JournalStepDocument
}

/**
 * List run journals, newest first.
 * @category Journal
 */
export async function listRunJournals(directory?: string): Promise<JournalRunDocument[]> {
  const base = directory ?? runsRoot()
  let names: string[]
  try {
    names = await readdir(base)
  } catch {
    return []
  }
  const docs: JournalRunDocument[] = []
  for (const name of names) {
    try {
      docs.push(await readRunJournal(name, base))
    } catch {
      /* skip incomplete dirs */
    }
  }
  docs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
  return docs
}
