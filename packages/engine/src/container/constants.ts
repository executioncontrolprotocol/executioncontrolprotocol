import type { EcpErrorCode } from "@executioncontrolprotocol/protocol"

/**
 * Programmer error from the service container. These codes are thrown, not
 * returned as operation errors.
 * @category Services
 */
export class ServiceError extends Error {
  /** Catalogue code. */
  readonly code: EcpErrorCode

  /**
   * @param code Catalogue code (`ECP_SERVICE_*`).
   * @param message One sentence naming the token and the implementations involved.
   */
  constructor(code: EcpErrorCode, message: string) {
    super(message)
    this.name = "ServiceError"
    this.code = code
  }
}

/** Step timeout when a capability does not set one. @category Services */
export const DEFAULT_STEP_TIMEOUT_MS = 600_000

/** Parallel lists in flight when a node does not set `maxConcurrency`. @category Services */
export const DEFAULT_MAX_CONCURRENCY = 4

/** Expression evaluation budget. @category Services */
export const DEFAULT_EXPR_TIMEOUT_MS = 50

/** Expression memory limit, 32 MiB. @category Services */
export const DEFAULT_EXPR_MEMORY_BYTES = 32 * 1024 * 1024

/** Maximum JSON bytes an expression may return, 1 MiB. @category Services */
export const DEFAULT_EXPR_MAX_RESULT_BYTES = 1024 * 1024
