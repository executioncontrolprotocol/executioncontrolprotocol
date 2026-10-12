import type { HarnessRunContext, ValidationIssue } from "@executioncontrolprotocol/types"

/** Compact failed-step row for assistant harness prompts. @category Harness */
export interface CompactFailedStepSummary {
  /** Step id. */
  stepId: string
  /** Step status. */
  status: string
  /** Joined diagnostic detail when present. */
  message?: string
}

/** Compact run context for assistant harness prompts. @category Harness */
export interface CompactRunContextSummary {
  /** Run id. */
  runId: string
  /** Run status. */
  status: string
  /** Workflow id when present. */
  workflowId?: string
  /** Workflow label when present. */
  workflowLabel?: string
  /** Failed step rows. */
  failedSteps: CompactFailedStepSummary[]
}

function formatIssueLine(issue: ValidationIssue): string {
  const path = issue.path?.trim()
  return path ? `${path}: ${issue.message}` : issue.message
}

/**
 * Join error diagnostics from a failed step for model prompts.
 * When a lead summary (no path) is followed by per-issue rows, use the detail rows only.
 * @category Harness
 */
export function formatStepFailureMessage(
  diagnostics: ValidationIssue[] | undefined
): string | undefined {
  if (!diagnostics?.length) return undefined
  const errors = diagnostics.filter((d) => d.severity === "error" || d.severity === undefined)
  let list = errors.length > 0 ? errors : diagnostics.slice(0, 1)
  if (list.length > 1 && !list[0]?.path?.trim()) {
    list = list.slice(1)
  }
  const lines = list.map(formatIssueLine).filter((line) => line.length > 0)
  return lines.length > 0 ? lines.join("; ") : undefined
}

/**
 * Summarize harness run context for model prompts.
 * @category Harness
 */
export function summarizeHarnessRunContext(context: HarnessRunContext): CompactRunContextSummary {
  const run = context.run
  const failedSteps: CompactFailedStepSummary[] = []
  for (const [stepId, record] of Object.entries(run.history ?? {})) {
    if (record.status === "failed") {
      failedSteps.push({
        stepId,
        status: record.status,
        message: formatStepFailureMessage(record.diagnostics),
      })
    }
  }
  const wf = context.workflow as { workflow?: { id?: string; label?: string } } | undefined
  return {
    runId: run.run.id,
    status: run.run.status,
    workflowId: wf?.workflow?.id,
    workflowLabel: wf?.workflow?.label,
    failedSteps,
  }
}

/**
 * Format run context summary as prompt lines.
 * @category Harness
 */
export function formatRunContextSummaryLines(context: HarnessRunContext): string[] {
  const summary = summarizeHarnessRunContext(context)
  const lines = [`Run ${summary.runId} status: ${summary.status}`]
  if (summary.workflowId) {
    lines.push(
      `Workflow: ${summary.workflowId}${summary.workflowLabel ? ` (${summary.workflowLabel})` : ""}`
    )
  }
  if (summary.failedSteps.length > 0) {
    lines.push("Failed steps:")
    for (const f of summary.failedSteps) {
      lines.push(
        f.message ? `- ${f.stepId}: ${f.status} — ${f.message}` : `- ${f.stepId}: ${f.status}`
      )
    }
  }
  return lines
}
