import type { ExprValue } from "@executioncontrolprotocol/types"

/**
 * Render expression to Fluent `expr.*` call.
 * @category Fluent
 */
export function renderExprValue(expr: ExprValue): string {
  if ("eq" in expr && Array.isArray(expr.eq)) {
    return `expr.eq(${JSON.stringify(String(expr.eq[0]))}, ${JSON.stringify(expr.eq[1])})`
  }
  if ("neq" in expr && Array.isArray(expr.neq)) {
    return `expr.neq(${JSON.stringify(String(expr.neq[0]))}, ${JSON.stringify(expr.neq[1])})`
  }
  return JSON.stringify(expr)
}
