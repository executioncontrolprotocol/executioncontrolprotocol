import type {
  DecodeResult,
  HarnessOperationFeedback,
  HarnessOperationStage,
  PatchResult,
  ValidationIssue,
  ValidationResult,
} from "@executioncontrolprotocol/types"

function issueKey(issue: ValidationIssue): string {
  return `${issue.path ?? ""}|${issue.code}|${issue.message}`
}

function mergeIssues(...groups: ValidationIssue[][]): ValidationIssue[] {
  const seen = new Set<string>()
  const merged: ValidationIssue[] = []
  for (const group of groups) {
    for (const issue of group) {
      const key = issueKey(issue)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(issue)
    }
  }
  return merged
}

/**
 * Collect structured harness feedback from a decode operation result.
 * @category Harness
 */
export function collectDecodeFeedback(result: DecodeResult): HarnessOperationFeedback {
  const validationErrors = result.validation?.errors ?? []
  const validationWarnings = result.validation?.warnings ?? []
  const issues = mergeIssues(result.diagnostics, validationErrors, validationWarnings)
  return {
    stage: "decode",
    success: result.success,
    targetSchema: result.targetSchema,
    issues,
  }
}

/**
 * Collect structured harness feedback from a patch operation result.
 * @category Harness
 */
export function collectPatchFeedback(result: PatchResult): HarnessOperationFeedback {
  const appliedIssues: ValidationIssue[] = []
  for (const entry of result.applied) {
    if (!entry.success && entry.diagnostics) {
      for (const d of entry.diagnostics) {
        appliedIssues.push({
          ...d,
          path: d.path ?? entry.path,
        })
      }
    }
  }
  const validationErrors = result.validation?.errors ?? []
  const validationWarnings = result.validation?.warnings ?? []
  const issues = mergeIssues(result.diagnostics, appliedIssues, validationErrors, validationWarnings)
  return {
    stage: "patch-apply",
    success: result.success,
    targetSchema: result.targetSchema,
    issues,
    applied: result.applied,
  }
}

/**
 * Collect structured harness feedback from a validation result.
 * @category Harness
 */
export function collectValidationFeedback(
  result: ValidationResult,
  stage: HarnessOperationStage = "validate"
): HarnessOperationFeedback {
  const issues = mergeIssues(result.errors, result.warnings)
  return {
    stage,
    success: result.valid,
    issues,
  }
}

/**
 * Build model-output guard feedback (e.g. echoed validation text).
 * @category Harness
 */
export function collectModelOutputFeedback(
  message: string,
  code = "MODEL_OUTPUT_INVALID"
): HarnessOperationFeedback {
  return {
    stage: "model-output",
    success: false,
    issues: [{ severity: "error", code, message }],
  }
}

/**
 * Merge multiple feedback records into one list (deduped issues per stage group).
 * @category Harness
 */
export function mergeHarnessFeedback(
  ...parts: HarnessOperationFeedback[]
): HarnessOperationFeedback[] {
  return parts
}

/**
 * Flatten feedback records into a single issue list.
 * @category Harness
 */
export function flattenHarnessFeedbackIssues(
  feedback: HarnessOperationFeedback[]
): ValidationIssue[] {
  return mergeIssues(...feedback.map((f) => f.issues))
}
