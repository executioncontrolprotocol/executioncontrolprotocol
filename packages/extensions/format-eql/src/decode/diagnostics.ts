import type { ValidationIssue } from "@executioncontrolprotocol/types"

export const EQL_ERROR_CODES = {
  SYNTAX: "EQL_SYNTAX",
  UNSUPPORTED_SCHEMA: "EQL_UNSUPPORTED_SCHEMA",
  MISSING_TARGET_SCHEMA: "EQL_MISSING_TARGET_SCHEMA",
  UNSUPPORTED_NODE: "EQL_UNSUPPORTED_NODE",
} as const

export function eqlSyntaxIssue(line: number, message: string): ValidationIssue {
  return {
    severity: "error",
    code: EQL_ERROR_CODES.SYNTAX,
    message,
    path: `line:${line}`,
  }
}

export function eqlIssue(
  code: string,
  message: string,
  path?: string
): ValidationIssue {
  return { severity: "error", code, message, path }
}
