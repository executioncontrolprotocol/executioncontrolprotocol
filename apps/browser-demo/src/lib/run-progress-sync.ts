import {
  reactFlowRunProgress,
  type ReactFlowRunLifecycleDetail,
  type ReactFlowStepStatus,
} from "@executioncontrolprotocol/format-reactflow"
import type { RunResult, RunStatus, StepRunRecord } from "@executioncontrolprotocol/types"

/** Format one diagnostic as `path: message` (or message alone). @category Demo */
function formatDiagnosticLine(issue: {
  message?: string
  path?: string
}): string | undefined {
  if (!issue.message) return undefined
  const path = issue.path?.trim()
  return path ? `${path}: ${issue.message}` : issue.message
}

/**
 * Join all error-severity diagnostics from a step history record for canvas/chat.
 * When a lead summary (no path) is followed by per-issue rows, use the detail rows only
 * so the node popover does not repeat the joined lead message.
 * @category Demo
 */
export function stepErrorMessage(record: StepRunRecord): string | undefined {
  const diagnostics = record.diagnostics ?? []
  if (diagnostics.length === 0) return undefined
  const errors = diagnostics.filter((d) => d.severity === "error" || d.severity === undefined)
  let list = errors.length > 0 ? errors : diagnostics.slice(0, 1)
  if (list.length > 1 && !list[0]?.path?.trim()) {
    list = list.slice(1)
  }
  const lines = list.map(formatDiagnosticLine).filter((line): line is string => Boolean(line))
  if (lines.length === 0) return undefined
  return lines.join("\n")
}

/** Map run history status to canvas step status. @category Demo */
export function historyStatusToCanvas(status: RunStatus): ReactFlowStepStatus | undefined {
  switch (status) {
    case "completed":
      return "completed"
    case "failed":
      return "failed"
    case "started":
      return "running"
    case "created":
      return "pending"
    case "cancelled":
    case "paused":
      return undefined
    default:
      return undefined
  }
}

function runOutcomeFromStatus(status: RunStatus): ReactFlowRunLifecycleDetail["outcome"] {
  if (status === "completed") return "completed"
  if (status === "cancelled") return "cancelled"
  return "failed"
}

/**
 * Reconcile canvas run progress from a terminal {@link RunResult}.
 * Fallback when lifecycle hooks lag or were skipped (e.g. policy deny).
 * @category Demo
 */
export function syncRunProgressFromResult(result: RunResult): void {
  const history = result.history ?? {}
  for (const [stepId, record] of Object.entries(history)) {
    const canvasStatus = historyStatusToCanvas(record.status)
    if (!canvasStatus) continue
    const message = record.status === "failed" ? stepErrorMessage(record) : undefined
    reactFlowRunProgress.emitStepStatus(stepId, canvasStatus, message)
  }
  reactFlowRunProgress.emitDone({
    runId: result.run.id,
    outcome: runOutcomeFromStatus(result.run.status),
  })
}

/** True when the run result represents a failed workflow execution. @category Demo */
export function isFailedRunResult(result: unknown): boolean {
  if (!result || typeof result !== "object") return false
  if ("error" in result && typeof (result as { error?: unknown }).error === "string") return true
  const run = (result as RunResult).run
  return run?.status === "failed" || run?.status === "cancelled"
}

/** Human-readable failure lines for modal / footer display. @category Demo */
export function collectRunFailureMessages(result: unknown): string[] {
  if (!result || typeof result !== "object") return []
  if ("error" in result && typeof (result as { error?: unknown }).error === "string") {
    return [(result as { error: string }).error]
  }
  const runResult = result as RunResult
  const messages: string[] = []
  for (const issue of runResult.diagnostics ?? []) {
    if (issue.severity === "warning" || issue.severity === "info") continue
    if (issue.message) messages.push(issue.message)
  }
  for (const [stepId, record] of Object.entries(runResult.history ?? {})) {
    if (record.status !== "failed") continue
    const message = stepErrorMessage(record)
    messages.push(message ? `${stepId}: ${message}` : `${stepId}: failed`)
  }
  if (
    messages.length === 0 &&
    (runResult.run?.status === "failed" || runResult.run?.status === "cancelled")
  ) {
    messages.push(`Run ${runResult.run.status}`)
  }
  return messages
}

/** Emit terminal failed run progress when no {@link RunResult} is available. @category Demo */
export function emitRunProgressFailed(runId?: string): void {
  reactFlowRunProgress.emitDone({ runId, outcome: "failed" })
}
