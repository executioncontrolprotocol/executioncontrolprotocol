import type { RunStatus } from "./schema.js"
import type { PolicyJournalDecision } from "./journal.js"

/** Public NDJSON event types for `ecp run --events`. @category Journal */
export type PublicRunEventType =
  | "run.start"
  | "step.start"
  | "step.policy"
  | "step.end"
  | "step.error"
  | "run.end"

/** One NDJSON lifecycle event. @category Journal */
export interface PublicRunEvent {
  /** Event name. */
  type: PublicRunEventType
  /** Run id. */
  runId: string
  /** Step id when the event is step-scoped. */
  stepId?: string
  /** Status when known. */
  status?: RunStatus
  /** Duration in milliseconds. */
  durationMs?: number
  /** ISO timestamp. */
  ts: string
  /** Policy evaluation (on `step.policy`). */
  policy?: PolicyJournalDecision
  /** Error payload. */
  error?: { code?: string; message: string }
}

/**
 * Build a public run event.
 * @category Journal
 */
export function publicRunEvent(
  type: PublicRunEventType,
  runId: string,
  extra: Omit<PublicRunEvent, "type" | "runId" | "ts"> = {}
): PublicRunEvent {
  return { type, runId, ts: new Date().toISOString(), ...extra }
}
