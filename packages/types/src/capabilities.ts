import type { ValidationIssue } from "./validation.js"

/** Minimum model generate capability input. @category Capabilities */
export interface GenerateCapabilityInput {
  prompt: string
  system?: string
  context?: unknown
  options?: Record<string, unknown>
}

/** Minimum model generate capability output. @category Capabilities */
export interface GenerateCapabilityOutput {
  text: string
  raw?: unknown
  usage?: unknown
  diagnostics?: ValidationIssue[]
}

/** Minimum evaluate capability input. @category Capabilities */
export interface EvaluateCapabilityInput {
  subject: unknown
  criteria?: unknown
  rubric?: unknown
  options?: Record<string, unknown>
}

/** Minimum evaluate capability output. @category Capabilities */
export interface EvaluateCapabilityOutput {
  passed?: boolean
  score?: number
  result?: unknown
  rationale?: string
  diagnostics?: ValidationIssue[]
}
