import type { EcpEncodingErrorCode } from "@executioncontrolprotocol/types"
import type { ValidationIssue } from "@executioncontrolprotocol/types"

/** Options for {@link EcpError}. @category Encoding */
export interface EcpErrorOptions {
  /** Human-readable message. */
  message: string
  /** Validation issues when decode/encode fails validation. */
  diagnostics?: ValidationIssue[]
  /** Additional context. */
  details?: Record<string, unknown>
}

/**
 * Typed error for encoding operations.
 * @category Encoding
 */
export class EcpError extends Error {
  /** Error code from {@link ECP_ENCODING_ERROR_CODES}. */
  readonly code: EcpEncodingErrorCode
  /** Optional validation diagnostics. */
  readonly diagnostics?: ValidationIssue[]
  /** Optional extra details. */
  readonly details?: Record<string, unknown>

  constructor(code: EcpEncodingErrorCode, options: EcpErrorOptions) {
    super(options.message)
    this.name = "EcpError"
    this.code = code
    this.diagnostics = options.diagnostics
    this.details = options.details
  }
}
