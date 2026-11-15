import type { ExprValue } from "../types/index.js"
import { isSerializableFunction } from "../helpers/serializable-function.js"

/**
 * Render expression to Fluent `expr(...)` call.
 * @category Fluent
 */
export function renderExprValue(expr: ExprValue): string {
  if (!isSerializableFunction(expr)) {
    return JSON.stringify(expr)
  }
  return `expr(${expr.source})`
}
