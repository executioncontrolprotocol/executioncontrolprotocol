import type { EcpErrorCode } from "./errors.js"

/**
 * One validation finding. Errors sort before warnings; each group is ordered
 * by document position.
 * @category Validation
 */
export interface ValidationIssue {
  /** Catalogue code. */
  code: EcpErrorCode
  /** `error` fails the result; `warning` does not. */
  severity: "error" | "warning"
  /** One model-readable sentence naming the offending value. */
  message: string
  /** JSON Pointer into the manifest, or `/input/…` for run input. */
  path: string
  /** Id of the enclosing node, when the issue is inside one. */
  nodeId?: string
  /** Line in the expr or script source. */
  line?: number
  /** Column in the expr or script source. */
  column?: number
  /** Relevant JSON Schema fragment, trimmed to 2 KB. */
  expected?: unknown
  /** Offending value, trimmed to 1 KB. Secrets are never included. */
  actual?: unknown
  /** Concrete fixes. */
  suggestions?: string[]
  /** Valid ref paths at this point, capped at 50. */
  available?: string[]
}

/**
 * Result of validating an execution. `valid` is true when there is no issue
 * of severity `error`.
 * @category Validation
 */
export interface ValidationResult {
  /** No error-severity issues. */
  valid: boolean
  /** Errors first, then warnings, each group in document order. */
  issues: ValidationIssue[]
  /** SHA-256 of the canonical (sorted-keys) manifest JSON. */
  manifestHash: string
  /** Hash of the generated schema. Changes when plugins change. */
  schemaHash: string
}

/**
 * Severity of a {@link ValidationIssue}.
 * @category Validation
 */
export type ValidationSeverity = ValidationIssue["severity"]
