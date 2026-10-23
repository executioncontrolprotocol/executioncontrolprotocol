import type { CapabilityId } from "./schema.js"
import type { EcpVersion } from "./version.js"
import type { ValidationIssue, ValidationResult } from "./validation.js"

/** Invoke error codes. @category Invoke */
export const ECP_INVOKE_ERROR_CODES = {
  CAPABILITY_NOT_FOUND: "CAPABILITY_NOT_FOUND",
  INVOKE_INPUT_INVALID: "INVOKE_INPUT_INVALID",
  INVOKE_OUTPUT_INVALID: "INVOKE_OUTPUT_INVALID",
  INVOKE_DENIED: "INVOKE_DENIED",
  INVOKE_FAILED: "INVOKE_FAILED",
  REMOTE_INVOKE_REQUIRED: "REMOTE_INVOKE_REQUIRED",
} as const

/** Invoke error code union. @category Invoke */
export type EcpInvokeErrorCode =
  (typeof ECP_INVOKE_ERROR_CODES)[keyof typeof ECP_INVOKE_ERROR_CODES]

/** Usage summary returned from direct invocation when available. @category Invoke */
export interface UsageSummary {
  /** Model API calls recorded during invocation. */
  modelCalls?: number
  /** Estimated cost in USD. */
  costUsd?: number
  /** Token count when reported by the provider. */
  tokens?: number
  /** Technical retry attempts recorded during invocation. */
  retries?: number
}

/** Direct capability invocation result. @category Invoke */
export interface InvokeResult<T = unknown> {
  /** Result schema discriminator. */
  schema: "@executioncontrolprotocol.invoke.result"
  /** ECP version. */
  version: EcpVersion
  /** Whether invocation succeeded. */
  success: boolean
  /** Invoked capability id. */
  capabilityId: CapabilityId
  /** Handler output when successful. */
  result?: T
  /** Input/output validation details. */
  validation?: ValidationResult
  /** Failure diagnostics. */
  diagnostics: ValidationIssue[]
  /** Usage accumulated during invocation. */
  usage?: UsageSummary
}

/**
 * HTTP status for an invoke result on `POST /v1/invoke`.
 * Successful results are 200. Failures map diagnostic codes to 4xx/5xx.
 * @category Invoke
 */
export function httpStatusForInvokeResult(result: InvokeResult): number {
  if (result.success) return 200
  const code = result.diagnostics[0]?.code
  if (code === ECP_INVOKE_ERROR_CODES.CAPABILITY_NOT_FOUND) return 404
  if (
    code === ECP_INVOKE_ERROR_CODES.INVOKE_INPUT_INVALID ||
    code === ECP_INVOKE_ERROR_CODES.INVOKE_OUTPUT_INVALID
  ) {
    return 400
  }
  if (code === ECP_INVOKE_ERROR_CODES.INVOKE_DENIED) return 403
  if (code === ECP_INVOKE_ERROR_CODES.REMOTE_INVOKE_REQUIRED) return 503
  return 500
}
