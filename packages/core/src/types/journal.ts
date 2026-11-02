import type { RunStatus } from "./schema.js"
import type { PolicyDecision } from "./lifecycle.js"
import type { PendingMutation } from "./store.js"
import type { ValidationIssue } from "./validation.js"

/** Terminal error recorded on `run.json` or a step file. @category Journal */
export interface JournalError {
  /** Stable `ECP_*` code. */
  code?: string
  /** Diagnostic message. */
  message: string
  /** JSON-safe fields from the thrown error. */
  details?: Record<string, unknown>
  /** Failed or paused step id (on `run.json` only). */
  stepId?: string
}

/** Journal format version. Breaking changes bump this. @category Journal */
export const JOURNAL_VERSION = 1

/** Recorded approval for a paused step. @category Journal */
export interface RunApproval {
  /** Step that was approved. */
  stepId: string
  /** Who approved (CLI `--approve` uses `"cli"`). */
  approvedBy: string
  /** ISO timestamp. */
  at: string
}

/** One policy evaluation captured on a step. @category Journal */
export interface PolicyJournalDecision {
  /** Policy definition id. */
  policyId: string
  /** Policy lifecycle event. */
  event: "policy:pre" | "policy:post" | "policy:finally"
  /** Combined decision type. */
  decision: PolicyDecision["type"]
  /** Reason when the decision is deny or pause. */
  reason?: string
}

/** Metadata the host journal writer needs from a run. @category Journal */
export interface RunJournalMeta {
  /** Absolute or original workflow file path. */
  workflowPath?: string
  /** Hex digest of the workflow file contents. */
  workflowHash?: string
  /** Environment definition id. */
  environmentId?: string
  /** Installed plugin package versions. */
  pluginVersions?: Record<string, string>
  /** Override directory (tests); default `.ecp/runs`. */
  directory?: string
  /** Parent run this resume/rerun was created from. */
  parentRunId?: string
  /** Source run id when this run is a resume. */
  resumedFrom?: string
}

/** `run.json` document. @category Journal */
export interface JournalRunDocument {
  /** Format version. */
  journalVersion: typeof JOURNAL_VERSION
  /** Run id. */
  runId: string
  /** Workflow file path. */
  workflowPath?: string
  /** Workflow file content hash. */
  workflowHash?: string
  /** Environment definition id. */
  environmentId: string
  /** Plugin package versions at run time. */
  pluginVersions?: Record<string, string>
  /** Redacted workflow input. */
  input: Record<string, unknown>
  /** Final run status. */
  status: RunStatus
  /** Inclusive cursor (last completed, stopped, or paused step). */
  cursor?: string
  /** ISO start time. */
  startedAt: string
  /** ISO end time. */
  endedAt?: string
  /** Redacted error. */
  error?: JournalError
  /** Parent run id. */
  parentRunId?: string
  /** Source run id for a resume. */
  resumedFrom?: string
  /** Approvals recorded for this run. */
  approvals?: RunApproval[]
}

/** `steps/<stepId>.json` document. @category Journal */
export interface JournalStepDocument {
  /** Step id. */
  stepId: string
  /** Capability id. */
  capabilityId: string
  /** Canonical definition hash. */
  definitionHash: string
  /** Redacted resolved input. */
  input?: Record<string, unknown>
  /** Redacted output. */
  output?: unknown
  /** Policy evaluations. */
  policyDecisions?: PolicyJournalDecision[]
  /** Staged mutations (pre-commit). */
  stagedMutations?: PendingMutation[]
  /** Committed state after the step (redacted). */
  committedState?: Record<string, unknown>
  /** Attempt count. */
  attempts: number
  /** ISO start. */
  startedAt: string
  /** ISO end. */
  endedAt?: string
  /** Duration in milliseconds. */
  durationMs?: number
  /** Step status. */
  status: RunStatus
  /** Redacted error. */
  error?: JournalError
  /** Full diagnostic list, including `details`. */
  diagnostics?: ValidationIssue[]
}
