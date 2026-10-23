import type { EcpVersion } from "./version.js"

/** Validation issue severity. @category Validation */
export type ValidationSeverity = "error" | "warning" | "info"

/** Single validation issue. @category Validation */
export interface ValidationIssue {
  code: string
  message: string
  path?: string
  suggestions?: string[]
  severity?: ValidationSeverity
}

/** Validation result document. @category Validation */
export interface ValidationResult {
  schema: "@executioncontrolprotocol.validation.result"
  version: EcpVersion
  valid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}
