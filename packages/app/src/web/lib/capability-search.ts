import type { RetrieveInput } from "@executioncontrolprotocol/protocol"

/**
 * Maximum capabilities returned for an empty search query.
 * @category App
 */
export const CAPABILITY_LIST_LIMIT = 100

/**
 * Maximum capabilities returned when the user is typing a query.
 * @category App
 */
export const CAPABILITY_SEARCH_LIMIT = 50

/**
 * Debounce delay for capability search retrieve calls.
 * @category App
 */
export const CAPABILITY_SEARCH_DEBOUNCE_MS = 150

/**
 * Build a host `retrieve` input for the capability menu search field.
 * @category App
 */
export function capabilityRetrieveInput(query: string): RetrieveInput {
  const trimmed = query.trim()
  if (trimmed.length === 0) return { type: "capability", limit: CAPABILITY_LIST_LIMIT }
  return { type: "capability", query: trimmed, limit: CAPABILITY_SEARCH_LIMIT }
}

/**
 * Whether a capability search response is still current for the active request id.
 * @category App
 */
export function isLatestCapabilityRequest(requestId: number, latestId: number): boolean {
  return requestId === latestId
}