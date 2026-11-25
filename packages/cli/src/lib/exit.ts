import { catalogueEntry, isEcpErrorCode, type OperationResponse } from "@executioncontrolprotocol/protocol"

/**
 * Exit code for an operation envelope (spec 06).
 * @category CLI
 */
export function exitCodeForEnvelope(envelope: OperationResponse<unknown>): number {
  if (!envelope.ok) {
    const code = envelope.error.code
    if (isEcpErrorCode(code)) return catalogueEntry(code).exitCode
    return 1
  }
  const data = envelope.data as { status?: string; validation?: { valid?: boolean } }
  if (data.validation && data.validation.valid === false) return 2
  if (data.status === "failed" || data.status === "cancelled") return 1
  return 0
}

/**
 * Exit the process with a catalogue-aware code.
 * @category CLI
 */
export function exitWith(code: number): never {
  process.exit(code)
}
