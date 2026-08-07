import { describe, expect, it } from "vitest"
import {
  runModelRepairLoop,
  collectModelOutputFeedback,
  type ModelRepairGenerateContext,
} from "@executioncontrolprotocol/core"
import { formatFeedbackForModel } from "@executioncontrolprotocol/core"

/**
 * Deterministic contract test for the harness repair loop.
 *
 * Proves the highest-leverage quality mechanism: when a model fails N times,
 * the loop performs the right number of attempts and feeds the accumulated
 * structured feedback from every prior attempt into the next model call.
 */
describe("harness repair loop contract", () => {
  it("retries N times and passes accumulated feedback to each retry", async () => {
    const seenFeedbackText: (string | undefined)[] = []
    const seenAttempts: number[] = []

    const result = await runModelRepairLoop<{ ok: true }>({
      maxAttempts: 3,
      generate: async (ctx: ModelRepairGenerateContext) => {
        seenAttempts.push(ctx.attempt)
        seenFeedbackText.push(formatFeedbackForModel(ctx.priorFeedback))
        return { raw: `attempt-${ctx.attempt}` }
      },
      evaluate: async (raw) => {
        // Fail the first two attempts with distinct, identifiable feedback.
        if (raw === "attempt-0") {
          return { success: false, feedback: [collectModelOutputFeedback("missing schema", "ERR_SCHEMA")] }
        }
        if (raw === "attempt-1") {
          return { success: false, feedback: [collectModelOutputFeedback("missing steps", "ERR_STEPS")] }
        }
        return { success: true, artifact: { ok: true }, feedback: [] }
      },
    })

    // Succeeded on the third attempt.
    expect(result.artifact).toEqual({ ok: true })
    expect(result.attempts).toHaveLength(3)
    expect(seenAttempts).toEqual([0, 1, 2])

    // Attempt 0 sees no prior feedback.
    expect(seenFeedbackText[0]).toBeUndefined()

    // Attempt 1 sees feedback from attempt 0 only.
    expect(seenFeedbackText[1]).toContain("missing schema")
    expect(seenFeedbackText[1]).not.toContain("missing steps")

    // Attempt 2 sees accumulated feedback from attempts 0 and 1.
    expect(seenFeedbackText[2]).toContain("missing schema")
    expect(seenFeedbackText[2]).toContain("missing steps")

    // Each recorded attempt carries its own raw output.
    expect(result.attempts.map((a) => a.rawOutput)).toEqual([
      "attempt-0",
      "attempt-1",
      "attempt-2",
    ])

    // The first two recorded attempts carry the failure feedback; the last is clean.
    expect(result.attempts[0]!.feedback.flatMap((f) => f.issues)).not.toHaveLength(0)
    expect(result.attempts[1]!.feedback.flatMap((f) => f.issues)).not.toHaveLength(0)
    expect(result.attempts[2]!.feedback).toHaveLength(0)
  })

  it("throws after exhausting attempts and surfaces the final feedback", async () => {
    let calls = 0
    await expect(
      runModelRepairLoop({
        maxAttempts: 2,
        generate: async () => {
          calls += 1
          return { raw: "still-bad" }
        },
        evaluate: async () => ({
          success: false,
          feedback: [collectModelOutputFeedback("persistent failure", "ERR_PERSIST")],
        }),
      })
    ).rejects.toThrow(/persistent failure/)
    expect(calls).toBe(2)
  })
})
