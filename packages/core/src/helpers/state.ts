import type { StateValue, StoreStateHandle } from "@executioncontrolprotocol/types"

/** Options for optional state handles. */
export interface StateOptions {
  optional?: boolean
  fallback?: unknown
}

/**
 * Mutable state handle for staged store mutations.
 * @category Workflow
 */
export function state<T = unknown>(
  path: string,
  options?: StateOptions
): StoreStateHandle<T> & StateValue {
  const handle = {
    path,
    $state: path,
    __brand: undefined as T,
    ...(options?.optional !== undefined ? { optional: options.optional } : {}),
    ...(options?.fallback !== undefined ? { fallback: options.fallback } : {}),
  }
  return handle as StoreStateHandle<T> & StateValue
}
