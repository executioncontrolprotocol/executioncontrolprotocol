/**
 * Error code for failures reported by Adobe (IMS or a Firefly Services API).
 * @category Plugins
 */
export const PROVIDER_ERROR = "ECP_PROVIDER_ERROR"

/**
 * Error code for a config object that fails the plugin's config schema.
 * @category Plugins
 */
export const CONFIG_INVALID = "ECP_CONFIG_INVALID"

/**
 * Error code for capability input that cannot form a valid Adobe request.
 * @category Plugins
 */
export const INPUT_INVALID = "ECP_INPUT_INVALID"

/**
 * Error thrown by the Adobe plugin. The host reads `code` and `details` into the step record.
 * @category Plugins
 */
export class AdobeServiceError extends Error {
  /** Stable `ECP_*` code. */
  readonly code: string
  /** Structured facts for the caller (HTTP status, response body, issue paths). */
  readonly details: Record<string, unknown>

  /**
   * @param code `ECP_*` code.
   * @param message One sentence saying what failed.
   * @param details Structured facts for the caller.
   */
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = "AdobeServiceError"
    this.code = code
    this.details = details
  }
}

/**
 * True for the error a fetch or sleep throws when its signal aborts.
 * @category Plugins
 */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    ((error as { name?: unknown }).name === "AbortError" || (error as { name?: unknown }).name === "TimeoutError")
  )
}

/**
 * Message text of an unknown thrown value.
 * @category Plugins
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
