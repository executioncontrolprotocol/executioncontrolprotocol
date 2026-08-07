import type { AppliedPatchEntry } from "./patch.js"
import type { EcpSchema } from "./schema.js"
import type { ValidationIssue } from "./validation.js"

/**
 * Stage of a harness model-evaluation operation (decode, patch, validate, or raw output guard).
 * @category Harness
 */
export type HarnessOperationStage = "decode" | "patch-apply" | "validate" | "model-output"

/**
 * Structured feedback from core decode, patch, or validate operations for harness repair decisions.
 * @category Harness
 */
export interface HarnessOperationFeedback {
  /** Operation stage that produced this feedback. */
  stage: HarnessOperationStage
  /** Whether the operation succeeded at this stage. */
  success: boolean
  /** Target schema when known (e.g. `@executioncontrolprotocol.workflow`, `@executioncontrolprotocol.patch`). */
  targetSchema?: EcpSchema | string
  /** Validation and diagnostic issues with paths and codes. */
  issues: ValidationIssue[]
  /** Per-entry patch apply results when stage is patch-apply. */
  applied?: AppliedPatchEntry[]
  /** Raw model text associated with this attempt when relevant. */
  rawOutput?: string
}

/**
 * One model call attempt during a harness repair loop.
 * @category Harness
 */
export interface HarnessRepairAttempt {
  /** Zero-based attempt index. */
  attempt: number
  /** Structured feedback collected for this attempt. */
  feedback: HarnessOperationFeedback[]
  /** Raw model output for this attempt. */
  rawOutput?: string
  /** Wall-clock ms in model generate for this attempt (when timing debug enabled). */
  generateMs?: number
  /** Wall-clock ms in harness evaluate (compile/decode/validate) for this attempt. */
  evaluateMs?: number
}
