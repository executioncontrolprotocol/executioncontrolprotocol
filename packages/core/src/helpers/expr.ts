import type { ExprValue } from "../types/index.js"
import { serializeFunction } from "./serializable-function.js"

/** Predicate over run state for `.when()` / loop `until`. @category Workflow */
export type ExprPredicate = (state: Record<string, unknown>) => unknown

/**
 * Build a portable workflow condition from a JS predicate.
 * Serializes via `Function#toString` — outer locals are not captured.
 * Prefer reading `state` inside the function; use `ref()` for step inputs, not here.
 *
 * @example
 * ```ts
 * .when(expr((state) => state.expand !== false))
 * ```
 *
 * @category Workflow
 */
export function expr(fn: ExprPredicate): ExprValue {
  return serializeFunction(fn as (...args: never[]) => unknown, ["state"])
}
