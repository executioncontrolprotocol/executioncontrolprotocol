import { EXIT_FAILED } from "./codes.js"
import type { EcpErrorBody } from "./envelope.js"

/**
 * Thrown by generated commands and operations so {@link EcpCommand} can print
 * the ECP envelope and set the process exit code.
 * @category CLI
 */
export class EcpCliError extends Error {
  /** Stable `ECP_*` (or invoke) code. */
  readonly code: string
  /** Optional JSON-pointer or flag path. */
  readonly path?: string
  /** Optional recovery hints. */
  readonly suggestions?: string[]
  /** Structured extras (for example missing-plugin rows). */
  readonly details?: unknown
  /** Process exit code. */
  readonly exitCode: number

  constructor(
    code: string,
    message: string,
    options: { path?: string; suggestions?: string[]; exitCode?: number; details?: unknown } = {}
  ) {
    super(message)
    this.name = "EcpCliError"
    this.code = code
    this.path = options.path
    this.suggestions = options.suggestions
    this.details = options.details
    this.exitCode = options.exitCode ?? EXIT_FAILED
  }

  /** Convert to the envelope error body. */
  toBody(): EcpErrorBody {
    return {
      code: this.code,
      message: this.message,
      ...(this.path !== undefined ? { path: this.path } : {}),
      ...(this.suggestions !== undefined ? { suggestions: this.suggestions } : {}),
      ...(this.details !== undefined ? { details: this.details } : {}),
    }
  }
}
