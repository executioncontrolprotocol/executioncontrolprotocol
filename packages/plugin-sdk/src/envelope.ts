/**
 * Structured error body used in the CLI `--json` envelope.
 * @category CLI
 */
export interface EcpErrorBody {
  /** Stable `ECP_*` (or invoke) code. */
  code: string
  /** Human-readable message. */
  message: string
  /** Optional JSON-pointer or flag path. */
  path?: string
  /** Optional recovery hints. */
  suggestions?: string[]
  /** Structured extras (for example missing-plugin rows). */
  details?: unknown
}

/**
 * Success envelope printed with `--json` or when stdout is not a TTY.
 * @category CLI
 */
export interface EcpSuccessEnvelope {
  ok: true
  data: unknown
}

/**
 * Failure envelope printed with `--json` or when stdout is not a TTY.
 * Execution failures (`ecp run`, invoke) include `data` with the same record
 * a successful run would print.
 * @category CLI
 */
export interface EcpFailureEnvelope {
  ok: false
  error: EcpErrorBody
  /** Execution record (`RunResult` or invoke document) when the command ran. */
  data?: unknown
}

/**
 * CLI JSON envelope.
 * @category CLI
 */
export type EcpEnvelope = EcpSuccessEnvelope | EcpFailureEnvelope

/**
 * Build a success envelope.
 * @category CLI
 */
export function successEnvelope(data: unknown): EcpSuccessEnvelope {
  return { ok: true, data }
}

/**
 * Build a failure envelope.
 * @category CLI
 */
export function failureEnvelope(error: EcpErrorBody, data?: unknown): EcpFailureEnvelope {
  return data !== undefined ? { ok: false, error, data } : { ok: false, error }
}
