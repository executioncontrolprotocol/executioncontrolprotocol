import { eqlSyntaxIssue } from "./diagnostics.js"
import type { ValidationIssue } from "@executioncontrolprotocol/types"

/** Parse a scalar or composite literal from EQL token text. */
export function parseLiteral(
  text: string,
  line: number
): { value?: unknown; issues: ValidationIssue[] } {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return { issues: [eqlSyntaxIssue(line, "Expected a value")] }
  }

  if (trimmed === "true") return { value: true, issues: [] }
  if (trimmed === "false") return { value: false, issues: [] }
  if (trimmed === "null") return { value: null, issues: [] }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { value: Number(trimmed), issues: [] }
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const inner = trimmed.slice(1, -1)
    return { value: inner.replace(/\\"/g, '"').replace(/\\'/g, "'"), issues: [] }
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { value: JSON.parse(trimmed) as unknown, issues: [] }
    } catch {
      return { issues: [eqlSyntaxIssue(line, `Invalid JSON literal: ${trimmed}`)] }
    }
  }

  if (/^[A-Za-z_@][\w./-]*$/.test(trimmed)) {
    return { value: trimmed, issues: [] }
  }

  return { issues: [eqlSyntaxIssue(line, `Unsupported literal: ${trimmed}`)] }
}

export function parseRefPath(refToken: string, line: number): { value?: { $ref: string }; issues: ValidationIssue[] } {
  const path = refToken.trim()
  if (!path) {
    return { issues: [eqlSyntaxIssue(line, "REF requires a path")] }
  }
  const statePath = path.startsWith("state.") ? path : `state.${path}`
  return { value: { $ref: statePath }, issues: [] }
}

export function parseStatePath(stateToken: string, line: number): { value?: { $state: string }; issues: ValidationIssue[] } {
  const path = stateToken.trim()
  if (!path) {
    return { issues: [eqlSyntaxIssue(line, "STATE requires a path")] }
  }
  return { value: { $state: path }, issues: [] }
}

/** Parse `field == value` into ExprValue. */
export function parseWhenExpr(
  expr: string,
  line: number
): { value?: import("@executioncontrolprotocol/types").ExprValue; issues: ValidationIssue[] } {
  const eqIndex = expr.indexOf("==")
  if (eqIndex === -1) {
    return { issues: [eqlSyntaxIssue(line, `Unsupported WHEN expression: ${expr}`)] }
  }
  const left = expr.slice(0, eqIndex).trim()
  const right = expr.slice(eqIndex + 2).trim()
  const lit = parseLiteral(right, line)
  if (lit.issues.length > 0) return { issues: lit.issues }
  const statePath = left.startsWith("state.") ? left : `state.${left}`
  return { value: { eq: [statePath, lit.value] }, issues: [] }
}
