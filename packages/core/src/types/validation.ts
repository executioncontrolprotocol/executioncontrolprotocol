import type { EcpVersion } from "./version.js"

/** Validation issue severity. @category Validation */
export type ValidationSeverity = "error" | "warning" | "info"

/** Single validation issue. @category Validation */
export interface ValidationIssue {
  /** Stable `ECP_*` or schema issue code. */
  code: string
  /** Human-readable sentence from the validator or thrown error. */
  message: string
  /** JSON-pointer or field path when the issue is schema-scoped. */
  path?: string
  /** Recovery hints. */
  suggestions?: string[]
  /** Issue severity. */
  severity?: ValidationSeverity
  /**
   * JSON-safe fields copied from a thrown error (`status`, `bodyText`, `url`,
   * `name`). Omits `stack`.
   */
  details?: Record<string, unknown>
}

/** Validation result document. @category Validation */
export interface ValidationResult {
  schema: "@executioncontrolprotocol.validation.result"
  version: EcpVersion
  valid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}
