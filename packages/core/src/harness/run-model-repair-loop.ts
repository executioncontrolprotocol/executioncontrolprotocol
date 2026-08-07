import type {
  HarnessOperationFeedback,
  HarnessRepairAttempt,
} from "@executioncontrolprotocol/types"
import {
  isHarnessTimingDebugEnabled,
  logRepairLoopTiming,
} from "./repair-loop-timing.js"

/** Context for a single repair-loop model generation call. @category Harness */
export interface ModelRepairGenerateContext {
  /** Zero-based attempt index. */
  attempt: number
  /** Structured feedback from all prior failed evaluations. */
  priorFeedback: HarnessOperationFeedback[]
  /** Raw text from the immediately preceding failed attempt (when retrying). */
  priorRaw?: string
}

/** Result of evaluating raw model output. @category Harness */
export interface ModelRepairEvaluateResult<TArtifact = unknown> {
  /** Whether this attempt produced an acceptable artifact. */
  success: boolean
  /** Parsed artifact when successful. */
  artifact?: TArtifact
  /** Structured feedback for this attempt (may be empty on success). */
  feedback: HarnessOperationFeedback[]
}

/** Options for {@link runModelRepairLoop}. @category Harness */
export interface RunModelRepairLoopOptions<TArtifact = unknown> {
  /** Total model calls allowed (initial + repairs). */
  maxAttempts: number
  /** Invoke the model; harness supplies prompt/system policy. */
  generate: (ctx: ModelRepairGenerateContext) => Promise<{ raw: string }>
  /** Decode, patch, validate, etc.; return success and structured feedback. */
  evaluate: (
    raw: string,
    ctx: ModelRepairGenerateContext
  ) => Promise<ModelRepairEvaluateResult<TArtifact>>
}

/** Result of {@link runModelRepairLoop}. @category Harness */
export interface ModelRepairLoopResult<TArtifact = unknown> {
  /** Final artifact when the loop succeeded. */
  artifact: TArtifact
  /** Raw text from the successful attempt. */
  raw: string
  /** Per-attempt structured feedback and raw output. */
  attempts: HarnessRepairAttempt[]
}

/**
 * Run a policy-free model repair loop. Harnesses own prompt wording; core only orchestrates retries.
 * @category Harness
 */
export async function runModelRepairLoop<TArtifact = unknown>(
  options: RunModelRepairLoopOptions<TArtifact>
): Promise<ModelRepairLoopResult<TArtifact>> {
  const attempts: HarnessRepairAttempt[] = []
  let priorFeedback: HarnessOperationFeedback[] = []
  let priorRaw: string | undefined
  let lastRaw = ""
  const recordTiming = isHarnessTimingDebugEnabled()
  const loopStarted = recordTiming ? performance.now() : 0

  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    const genStart = recordTiming ? performance.now() : 0
    const { raw } = await options.generate({ attempt, priorFeedback, priorRaw })
    const generateMs = recordTiming ? performance.now() - genStart : undefined
    lastRaw = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2)
    const evalStart = recordTiming ? performance.now() : 0
    const evaluated = await options.evaluate(raw, { attempt, priorFeedback, priorRaw })
    const evaluateMs = recordTiming ? performance.now() - evalStart : undefined
    attempts.push({
      attempt,
      feedback: evaluated.feedback,
      rawOutput: raw,
      ...(generateMs !== undefined ? { generateMs } : {}),
      ...(evaluateMs !== undefined ? { evaluateMs } : {}),
    })

    if (evaluated.success && evaluated.artifact !== undefined) {
      if (recordTiming) {
        logRepairLoopTiming("repair-loop success", attempts, {
          loopTotalMs: performance.now() - loopStarted,
        })
      }
      return {
        artifact: evaluated.artifact,
        raw,
        attempts,
      }
    }

    priorFeedback = [...priorFeedback, ...evaluated.feedback]
    priorRaw = lastRaw
  }

  if (recordTiming) {
    logRepairLoopTiming("repair-loop exhausted", attempts, {
      loopTotalMs: performance.now() - loopStarted,
    })
  }

  const lastAttempt = attempts[attempts.length - 1]
  const issueSummary = lastAttempt?.feedback
    .flatMap((f) => f.issues)
    .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
    .join("; ")
  const err = new Error(
    `${issueSummary || "Harness evaluate failed after repair attempts"}\n---\nrawModelOutput:\n${lastRaw.slice(0, 4000)}`
  ) as Error & { repairAttempts?: HarnessRepairAttempt[] }
  err.repairAttempts = attempts
  throw err
}
