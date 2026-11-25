import { catalogueEntry, isEcpErrorCode, type OperationResponse } from "@executioncontrolprotocol/protocol"

/**
 * Map an operation envelope to an HTTP status.
 * @category Host
 */
export function statusForEnvelope(envelope: OperationResponse<unknown>): number {
  if (envelope.ok) return 200
  const code = envelope.error.code
  if (isEcpErrorCode(code)) {
    const status = catalogueEntry(code).httpStatus
    if (status !== null) return status
  }
  return 500
}

/**
 * Build a refused envelope.
 * @category Host
 */
export function refuse(
  code: string,
  message: string,
  extra?: { path?: string; suggestions?: string[]; retryAfterMs?: number },
): OperationResponse<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      ...extra,
    },
  }
}
