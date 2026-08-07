import type { ValidationIssue } from "@executioncontrolprotocol/types"
import type { ZodIssue } from "zod"

/** Map Zod issues to ECP validation issues. @category Validation */
export function zodIssuesToValidationIssues(issues: ZodIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    code: issue.code.toUpperCase(),
    message: issue.message,
    path: issue.path.length > 0 ? issue.path.join(".") : undefined,
    severity: "error" as const,
  }))
}
