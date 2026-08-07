import type { ExprValue } from "@executioncontrolprotocol/types"

/**
 * Workflow condition expressions.
 * @category Workflow
 */
export const expr = {
  /** Equality check against state path. */
  eq(path: string, value: unknown): ExprValue {
    return { eq: [path, value] }
  },
  /** Inequality check against state path. */
  neq(path: string, value: unknown): ExprValue {
    return { neq: [path, value] }
  },
}
