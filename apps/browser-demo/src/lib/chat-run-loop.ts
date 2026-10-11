import {
  collectRunFailureMessages,
  isFailedRunResult,
} from "./run-progress-sync.js"

/** Max automatic troubleshoot rounds after a chat-initiated failed run. @category Demo */
export const CHAT_AUTO_TROUBLESHOOT_MAX = 3

/** Shared prompt when auto-feeding run failures back to the chat harness. @category Demo */
export const CHAT_TROUBLESHOOT_PROMPT =
  "The last workflow run failed. Diagnose the errors from the run context and patch the workflow to fix them."

/** Exact chip-equivalent confirms (no model). Broader language uses intent classification. */
const CONFIRM_EXACT =
  /^(yes|y|yeah|yep|sure|ok|okay|run(?:\s+it)?|please\s+run(?:\s+it)?|inspect(?:\s+it)?|probe(?:\s+it)?)$/i
const DECLINE_EXACT = /^(no|n|nope|not\s+now|later|skip)$/i

/**
 * True when the user message is a bare confirmation to run (not a new authoring request).
 * @category Demo
 */
export function isRunOfferConfirm(message: string): boolean {
  return CONFIRM_EXACT.test(message.trim())
}

/**
 * True when the user message declines the run offer.
 * @category Demo
 */
export function isRunOfferDecline(message: string): boolean {
  return DECLINE_EXACT.test(message.trim())
}

/** How to treat a user turn while a host offer is pending. @category Demo */
export type PendingOfferAction = "confirm" | "decline" | "classify"

/**
 * Fast-path decision for a pending run offer (regex only).
 * Returns {@code classify} when the host should ask the harness intent classifier.
 * @category Demo
 */
export function resolvePendingOfferAction(message: string): PendingOfferAction {
  if (isRunOfferConfirm(message)) return "confirm"
  if (isRunOfferDecline(message)) return "decline"
  return "classify"
}

/**
 * True when the user message is a bare confirmation to run a probe.
 * @category Demo
 */
export function isProbeOfferConfirm(message: string): boolean {
  return CONFIRM_EXACT.test(message.trim())
}

/**
 * True when the user message declines a probe offer.
 * @category Demo
 */
export function isProbeOfferDecline(message: string): boolean {
  return DECLINE_EXACT.test(message.trim())
}

/**
 * Fast-path decision for a pending probe offer (regex only).
 * Returns {@code classify} when the host should ask the harness intent classifier.
 * @category Demo
 */
export function resolvePendingProbeOfferAction(message: string): PendingOfferAction {
  if (isProbeOfferConfirm(message)) return "confirm"
  if (isProbeOfferDecline(message)) return "decline"
  return "classify"
}

/**
 * Whether another auto-troubleshoot round is allowed.
 * @category Demo
 */
export function canAutoTroubleshoot(round: number, max = CHAT_AUTO_TROUBLESHOOT_MAX): boolean {
  return round < max
}

/**
 * Build a short conversational success line after a chat-initiated run.
 * Rich field values are rendered separately in chat via the run output view.
 * @category Demo
 */
export function formatChatRunSuccessMessage(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "Run completed."
  }
  const run = (result as { run?: { status?: string } }).run
  const status = run?.status ?? "completed"
  return status === "completed" ? "Run completed." : `Run ${status}.`
}

/**
 * Build a short failure summary for chat (before auto-troubleshoot).
 * @category Demo
 */
export function formatChatRunFailureMessage(result: unknown): string {
  const lines = collectRunFailureMessages(result)
  if (lines.length === 0) {
    return "The workflow run failed."
  }
  const joined = lines.slice(0, 3).join("; ")
  return `The workflow run failed: ${joined}`
}

/**
 * True when a stored run result is a real {@link RunResult}-shaped document for harness context.
 * @category Demo
 */
export function isHarnessRunResultDocument(result: unknown): boolean {
  if (!result || typeof result !== "object") return false
  if ("error" in result && typeof (result as { error?: unknown }).error === "string") {
    return false
  }
  const schema = (result as { schema?: unknown }).schema
  return schema === "@executioncontrolprotocol.run.result"
}

export { isFailedRunResult }
