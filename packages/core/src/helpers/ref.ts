import type { RefValue } from "@executioncontrolprotocol/types"

/** Options for optional refs. */
export interface RefOptions {
  optional?: boolean
  fallback?: unknown
}

/**
 * Read-only reference to committed workflow state.
 * @category Workflow
 */
export function ref(path: string, options?: RefOptions): RefValue {
  const normalized = path.startsWith("state.") ? path : `state.${path}`
  return {
    $ref: normalized,
    ...(options?.optional !== undefined ? { optional: options.optional } : {}),
    ...(options?.fallback !== undefined ? { fallback: options.fallback } : {}),
  }
}
