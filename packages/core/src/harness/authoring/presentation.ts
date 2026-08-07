import type { HarnessOperationFeedback, ValidationIssue } from "@executioncontrolprotocol/types"

/**
 * Format structured harness feedback for model repair prompts.
 * @category Harness
 */
export function formatFeedbackForModel(feedback: HarnessOperationFeedback[]): string | undefined {
  const issues = feedback.flatMap((f) => f.issues)
  if (issues.length === 0) return undefined
  const lines: string[] = []
  for (const issue of issues) {
    const code = issue.code ? ` [${issue.code}]` : ""
    lines.push(issue.path ? `${issue.path}: ${issue.message}${code}` : `${issue.message}${code}`)
  }
  return lines.join("; ")
}

/**
 * Compact repair instructions for small models (avoids echoing long prose).
 * @category Harness
 */
export function formatStructuredRepairForModel(
  feedback: HarnessOperationFeedback[]
): string | undefined {
  const issues = feedback.flatMap((f) => f.issues)
  if (issues.length === 0) return undefined
  const bullets = issues.map((issue) => {
    const code = issue.code ? ` (${issue.code})` : ""
    const path = issue.path ? `${issue.path}: ` : ""
    return `- ${path}${issue.message}${code}`
  })
  return ["Fix the document (EQL only — do not repeat these lines):", ...bullets].join("\n")
}

/** Default max chars for prior assistant output in repair dialog prompts. @category Harness */
export const HARNESS_REPAIR_PRIOR_OUTPUT_MAX_CHARS = 800

/** Options for {@link formatModelRepairDialogLines}. @category Harness */
export interface ModelRepairDialogOptions {
  /** When true, include truncated prior model output before repair feedback. */
  includePriorOutput?: boolean
  /** Max chars for {@link ModelRepairDialogOptions.priorRaw} (default {@link HARNESS_REPAIR_PRIOR_OUTPUT_MAX_CHARS}). */
  priorOutputMaxChars?: number
  /** Raw model output from the immediately preceding failed attempt. */
  priorRaw?: string
  /** Structured validation feedback (bullets or prose). */
  repairFeedback?: string
  /** Fixture-specific repair hint appended after feedback. */
  repairHint?: string
  /** Lead line shown before repair feedback. */
  repairLead: string
}

/**
 * Truncate prior model output for repair dialog prompts.
 * @category Harness
 */
export function truncatePriorModelOutput(
  raw: string,
  maxChars: number = HARNESS_REPAIR_PRIOR_OUTPUT_MAX_CHARS
): string {
  const trimmed = raw.trim()
  if (trimmed.length <= maxChars) {
    return trimmed
  }
  return `${trimmed.slice(0, maxChars)}\n... [truncated]`
}

/**
 * Build repair prompt lines with optional mini-dialog (prior assistant output + follow-up).
 * @category Harness
 */
export function formatModelRepairDialogLines(options: ModelRepairDialogOptions): string[] {
  const { repairFeedback, repairHint, repairLead } = options
  if (!repairFeedback && !repairHint) {
    return []
  }

  const lines: string[] = []
  const prior = options.priorRaw?.trim()

  if (options.includePriorOutput && prior) {
    lines.push(
      "--- Your previous output (fix it; do not copy validation errors verbatim) ---",
      truncatePriorModelOutput(prior, options.priorOutputMaxChars),
      "--- End previous output ---",
      ""
    )
  }

  if (repairFeedback) {
    const lead =
      options.includePriorOutput && prior
        ? `Follow-up: ${repairLead}`
        : repairLead
    lines.push(lead, repairFeedback)
  } else if (options.includePriorOutput && prior) {
    lines.push(`Follow-up: ${repairLead}`)
  }

  if (repairHint) {
    lines.push(repairHint)
  }

  return lines
}

const REPAIR_TEMPLATE_MARKERS =
  /\bexample-wf\b|\bexample-step\b|\bcapability-id\b|\banchor-step\b|\bremove-step\b|\btarget-step\b|\bnew-step\b|"Example label"/

/** True when model copied the neutral repair template instead of substituting real ids. */
export function isRepairTemplateEcho(raw: string): boolean {
  return REPAIR_TEMPLATE_MARKERS.test(raw)
}

/**
 * True when model output looks like echoed validation/repair text, not a document.
 * @category Harness
 */
export function isRepairFeedbackEcho(
  raw: string,
  formattedFeedback?: string
): boolean {
  const text = raw.trim()
  if (!text) return false
  if (formattedFeedback && text === formattedFeedback.trim()) return true
  if (/^Fix the document/i.test(text) && !/^\{/.test(text) && !/^schema:/m.test(text)) {
    return true
  }
  if (
    /PATCH WORKFLOW then workflow id/i.test(text) ||
    /PATCH WORKFLOW with the workflow id/i.test(text) ||
    /PATCH WORKFLOW <workflow-id>/i.test(text) ||
    /PATCH WORKFLOW label:/i.test(text) ||
    /change with UPDATE WORKFLOW LABEL, not UPDATE STEP/i.test(text) ||
    /UPDATE STEP step-id/i.test(text) ||
    /Repair syntax example only/i.test(text) ||
    /\bexample-wf\b/.test(text) ||
    /^Use MOVE STEP for reorder/i.test(text) ||
    /^Substitute ids and labels/i.test(text)
  ) {
    return true
  }
  if (/intent must be one of:/i.test(text) && !/^INTENT\s+\S+/i.test(text.split("\n")[0] ?? "")) {
    return true
  }
  if (/PATCH WORKFLOW \S+\s+then only required/i.test(text)) {
    return true
  }
  if ((text.match(/^WORKFLOW /gm) ?? []).length > 1) {
    return true
  }
  const feedbackProse =
    /Workflow must include steps|Missing uses:|MODEL_OUTPUT_INVALID|Do not repeat error|Add \d+ more step/i
  const firstLine = text.split("\n")[0] ?? ""
  const documentStart =
    /^(?:WORKFLOW \S|PATCH WORKFLOW \S|INTENT \S|REPLY$|STEP \S+ USES)/.test(firstLine) ||
    /^(?:```|schema:\s*@executioncontrolprotocol\.|"schema"\s*:|workflow:\s*@executioncontrolprotocol\.|\{\s*"schema")/i.test(firstLine)
  if (feedbackProse.test(text) && !documentStart) {
    return true
  }
  const echoPattern =
    /(?:workflow|steps|targetSchema|patches|schema):\s*(?:Required|Invalid)/i
  return echoPattern.test(text) && !documentStart
}

/**
 * Detect echo from structured issues only.
 * @category Harness
 */
export function isIssuesOnlyOutput(raw: string, issues: ValidationIssue[]): boolean {
  const formatted = issues
    .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
    .join("; ")
  return formatted.length > 0 && isRepairFeedbackEcho(raw, formatted)
}
