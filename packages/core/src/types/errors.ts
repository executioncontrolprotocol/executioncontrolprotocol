/**
 * Canonical ECP error catalogue (RESET-PLAN §4.6).
 * @category Errors
 */
export const ECP_ERROR_CODES = {
  /** The workflow file failed to transpile or load. */
  WORKFLOW_LOAD: "ECP_WORKFLOW_LOAD",
  /** Required plugins are not installed. */
  PLUGINS_MISSING: "ECP_PLUGINS_MISSING",
  /** An id does not match any installed capability. */
  CAPABILITY_UNKNOWN: "ECP_CAPABILITY_UNKNOWN",
  /** Step or operation input failed its schema. */
  INPUT_INVALID: "ECP_INPUT_INVALID",
  /** A `ref()` points to a missing step or field. */
  REF_UNRESOLVED: "ECP_REF_UNRESOLVED",
  /** Binding config failed `withConfig`, or a workflow bound a secrets provider. */
  BINDING_INVALID: "ECP_BINDING_INVALID",
  /** An extension does not `.supports()` the running environment. */
  ENVIRONMENT_UNSUPPORTED: "ECP_ENVIRONMENT_UNSUPPORTED",
  /** A referenced secret has no value. */
  SECRET_MISSING: "ECP_SECRET_MISSING",
  /** A policy blocked the step. */
  POLICY_DENIED: "ECP_POLICY_DENIED",
  /** A policy paused the run. */
  RUN_PAUSED: "ECP_RUN_PAUSED",
  /** The capability threw; the original message is preserved. */
  STEP_FAILED: "ECP_STEP_FAILED",
  /** The capability's output failed its schema. */
  OUTPUT_INVALID: "ECP_OUTPUT_INVALID",
  /** The plugin trust check refused an install. */
  PLUGIN_DENIED: "ECP_PLUGIN_DENIED",
  /** A step before `--from` changed since the journal was written. */
  RERUN_INCOMPATIBLE: "ECP_RERUN_INCOMPATIBLE",
} as const

/** Union of canonical ECP error codes. @category Errors */
export type EcpErrorCode = (typeof ECP_ERROR_CODES)[keyof typeof ECP_ERROR_CODES]

/** The workflow file failed to transpile or load. @category Errors */
export const ECP_WORKFLOW_LOAD = ECP_ERROR_CODES.WORKFLOW_LOAD

/** Required plugins are not installed. @category Errors */
export const ECP_PLUGINS_MISSING = ECP_ERROR_CODES.PLUGINS_MISSING

/** An id does not match any installed capability. @category Errors */
export const ECP_CAPABILITY_UNKNOWN = ECP_ERROR_CODES.CAPABILITY_UNKNOWN

/** Step or operation input failed its schema. @category Errors */
export const ECP_INPUT_INVALID = ECP_ERROR_CODES.INPUT_INVALID

/** A `ref()` points to a missing step or field. @category Errors */
export const ECP_REF_UNRESOLVED = ECP_ERROR_CODES.REF_UNRESOLVED

/** Binding config failed `withConfig`, or a workflow bound a secrets provider. @category Errors */
export const ECP_BINDING_INVALID = ECP_ERROR_CODES.BINDING_INVALID

/** An extension does not `.supports()` the running environment. @category Errors */
export const ECP_ENVIRONMENT_UNSUPPORTED = ECP_ERROR_CODES.ENVIRONMENT_UNSUPPORTED

/** A referenced secret has no value. @category Errors */
export const ECP_SECRET_MISSING = ECP_ERROR_CODES.SECRET_MISSING

/** A policy blocked the step. @category Errors */
export const ECP_POLICY_DENIED = ECP_ERROR_CODES.POLICY_DENIED

/** A policy paused the run. @category Errors */
export const ECP_RUN_PAUSED = ECP_ERROR_CODES.RUN_PAUSED

/** The capability threw; the original message is preserved. @category Errors */
export const ECP_STEP_FAILED = ECP_ERROR_CODES.STEP_FAILED

/** The capability's output failed its schema. @category Errors */
export const ECP_OUTPUT_INVALID = ECP_ERROR_CODES.OUTPUT_INVALID

/** The plugin trust check refused an install. @category Errors */
export const ECP_PLUGIN_DENIED = ECP_ERROR_CODES.PLUGIN_DENIED

/** A step before `--from` changed since the journal was written. @category Errors */
export const ECP_RERUN_INCOMPATIBLE = ECP_ERROR_CODES.RERUN_INCOMPATIBLE

/** Options for {@link EcpError}. @category Errors */
export interface EcpErrorOptions {
  /** JSON-pointer or dotted path to the failing field. */
  path?: string
  /** Repair hints for agents and CLI envelopes. */
  suggestions?: string[]
  /** Structured extras (for example missing-plugin rows). */
  details?: unknown
  /** Underlying cause. */
  cause?: unknown
}

/**
 * Typed ECP failure with a catalogue {@link EcpErrorCode}.
 * @category Errors
 */
export class EcpError extends Error {
  /** Catalogue code. */
  readonly code: string
  /** JSON-pointer or dotted path to the failing field. */
  readonly path?: string
  /** Repair hints for agents and CLI envelopes. */
  readonly suggestions?: string[]
  /** Structured extras (for example missing-plugin rows). */
  readonly details?: unknown

  constructor(code: string, message: string, options: EcpErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = "EcpError"
    this.code = code
    this.path = options.path
    this.suggestions = options.suggestions
    this.details = options.details
  }
}

/** True when `err` is an {@link EcpError}. @category Errors */
export function isEcpError(err: unknown): err is EcpError {
  return err instanceof EcpError
}
