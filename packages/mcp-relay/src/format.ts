import type { OperationResponse, ValidationIssue } from "@executioncontrolprotocol/protocol"

/**
 * MCP tool call result shape we return.
 * @category MCP
 */
export interface RelayToolResult {
  /** Text content for the model. */
  content: Array<{ type: "text"; text: string }>
  /** Structured data when the envelope was ok. */
  structuredContent?: Record<string, unknown>
  /** True when the host refused the operation. */
  isError?: boolean
}

/**
 * Map an operation envelope to an MCP tool result (spec 09).
 * @category MCP
 */
export function formatEnvelope(envelope: OperationResponse<unknown>): RelayToolResult {
  if (!envelope.ok) {
    return {
      content: [{ type: "text", text: formatError(envelope.error) }],
      structuredContent: { error: envelope.error },
      isError: true,
    }
  }
  const data = envelope.data
  const text = formatData(data)
  return {
    content: [{ type: "text", text }],
    structuredContent: data as Record<string, unknown>,
  }
}

/**
 * Format a refused operation for the model.
 * @category MCP
 */
export function formatError(error: {
  code: string
  message: string
  path?: string
  suggestions?: string[]
  issues?: ValidationIssue[]
}): string {
  const lines: string[] = []
  const issues = error.issues ?? []
  const errorIssues = issues.filter((issue) => issue.severity === "error")
  if (errorIssues.length > 0) {
    const noun = errorIssues.length === 1 ? "validation error" : "validation errors"
    // The header is the code and a count only; each issue line carries its own path.
    const head = `${error.code} — ${errorIssues.length} ${noun}`
    lines.push(head)
    for (const issue of issues) {
      lines.push(formatIssue(issue))
    }
    return lines.join("\n")
  }
  const head = error.path ? `${error.path}: ${error.code} — ${error.message}` : `${error.code} — ${error.message}`
  lines.push(head)
  for (const suggestion of error.suggestions ?? []) {
    lines.push(`  suggestion: ${suggestion}`)
  }
  for (const issue of issues) {
    lines.push(formatIssue(issue))
  }
  return lines.join("\n")
}

/**
 * Pretty-print successful data, with resume hint for interrupted runs.
 * @category MCP
 */
export function formatData(data: unknown): string {
  if (data && typeof data === "object" && "text" in (data as object)) {
    return String((data as { text: string }).text)
  }
  const run = data as { status?: string; runId?: string }
  let text = `${JSON.stringify(data, null, 2)}\n`
  if (run.status === "interrupted" && run.runId) {
    text += `\nHost restarted during this run. Call execute with { "resume": "${run.runId}" } to continue.\n`
  }
  return text
}

function formatIssue(issue: ValidationIssue): string {
  const suggestions =
    issue.suggestions && issue.suggestions.length > 0 ? ` (${issue.suggestions.join("; ")})` : ""
  return `${issue.path}: ${issue.code} — ${issue.message}${suggestions}`
}
