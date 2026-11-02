import type { RunResult, StepRunRecord, ValidationIssue } from "@executioncontrolprotocol/core/types"

/** Direct capability execution record printed by the CLI. @category CLI */
export interface InvokeExecutionRecord {
  /** Journal run id. */
  runId: string
  /** Workflow step id, or `invoke` for a direct call. */
  stepId: string
  /** Capability id. */
  capabilityId: string
  /** Run or step status when known. */
  status?: string
  /** Handler output when present. */
  output?: unknown
  /** Failure diagnostics. */
  diagnostics?: ValidationIssue[]
}

function indentJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")
}

function formatDiagnostic(issue: ValidationIssue): string[] {
  const lines = [`Failure: ${issue.message}`, `Error Code: ${issue.code}`]
  const bodyText =
    issue.details && typeof issue.details.bodyText === "string" ? issue.details.bodyText : undefined
  if (bodyText && bodyText !== issue.message) {
    lines.splice(1, 0, `Full Message: ${bodyText}`)
  }
  if (issue.details && Object.keys(issue.details).length > 0) {
    lines.push("details:", indentJson(issue.details))
  }
  return lines
}

function formatStepBlock(
  stepId: string,
  record: { output?: unknown; diagnostics?: ValidationIssue[] }
): string {
  const lines = [`Step ${stepId}`]
  for (const issue of record.diagnostics ?? []) {
    lines.push(...formatDiagnostic(issue))
  }
  if (record.output !== undefined) {
    lines.push("output:", indentJson(record.output))
  }
  return lines.join("\n")
}

function isRunResult(value: unknown): value is RunResult {
  if (value === null || typeof value !== "object") return false
  const row = value as Partial<RunResult>
  return row.schema === "@executioncontrolprotocol.run.result" && row.run !== undefined
}

function isInvokeExecutionRecord(value: unknown): value is InvokeExecutionRecord {
  if (value === null || typeof value !== "object") return false
  const row = value as Partial<InvokeExecutionRecord>
  return (
    typeof row.runId === "string" &&
    typeof row.stepId === "string" &&
    typeof row.capabilityId === "string"
  )
}

function formatRunResult(result: RunResult): string {
  const lines = [`Run ${result.run.id}  status: ${result.run.status}`]
  const history = result.history ?? {}
  for (const [stepId, record] of Object.entries(history) as [string, StepRunRecord][]) {
    lines.push(formatStepBlock(stepId, record))
  }
  if (result.diagnostics && result.diagnostics.length > 0 && Object.keys(history).length === 0) {
    for (const issue of result.diagnostics) {
      lines.push(...formatDiagnostic(issue))
    }
  }
  if (result.output !== undefined && Object.keys(history).length === 0) {
    lines.push("output:", indentJson(result.output))
  }
  return lines.join("\n")
}

function formatInvokeRecord(record: InvokeExecutionRecord): string {
  const status = record.status ?? (record.diagnostics && record.diagnostics.length > 0 ? "failed" : "completed")
  const lines = [`Run ${record.runId}  status: ${status}`]
  lines.push(formatStepBlock(record.stepId, record))
  return lines.join("\n")
}

/**
 * Pretty-print a run or invoke execution record. Returns `undefined` when `value`
 * is not an execution document (describe/search/compile stay JSON).
 * @category CLI
 */
export function formatExecutionReport(value: unknown): string | undefined {
  if (isRunResult(value)) return formatRunResult(value)
  if (isInvokeExecutionRecord(value)) return formatInvokeRecord(value)
  return undefined
}
