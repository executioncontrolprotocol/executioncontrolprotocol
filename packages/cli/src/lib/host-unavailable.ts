import type { OperationResponse } from "@executioncontrolprotocol/protocol"

/**
 * Build a spec-06 envelope for a host start/discovery failure.
 * @category CLI
 */
export function hostUnavailableEnvelope(error: Error & { suggestions?: string[] }): OperationResponse<never> {
  const message = error.message.replace(/^ECP_HOST_UNAVAILABLE:\s*/i, "")
  return {
    ok: false,
    error: {
      code: "ECP_HOST_UNAVAILABLE",
      message,
      suggestions: error.suggestions,
    },
  }
}

/**
 * Whether an error is `ECP_HOST_UNAVAILABLE`.
 * @category CLI
 */
export function isHostUnavailableError(error: unknown): error is Error & { code: string } {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "ECP_HOST_UNAVAILABLE")
}