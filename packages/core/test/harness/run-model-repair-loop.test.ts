import { describe, expect, it } from "vitest"
import { runModelRepairLoop } from "../../src/harness/run-model-repair-loop.js"
import { collectModelOutputFeedback } from "../../src/feedback/collect.js"

describe("runModelRepairLoop", () => {
  it("retries until evaluate succeeds", async () => {
    let calls = 0
    const result = await runModelRepairLoop({
      maxAttempts: 3,
      generate: async () => {
        calls += 1
        return { raw: `attempt-${calls}` }
      },
      evaluate: async (raw) => {
        if (raw === "attempt-2") {
          return { success: true, artifact: { ok: true }, feedback: [] }
        }
        return {
          success: false,
          feedback: [collectModelOutputFeedback("not yet")],
        }
      },
    })

    expect(result.artifact).toEqual({ ok: true })
    expect(result.attempts).toHaveLength(2)
    expect(calls).toBe(2)
  })

  it("throws after exhausting attempts", async () => {
    await expect(
      runModelRepairLoop({
        maxAttempts: 1,
        generate: async () => ({ raw: "bad" }),
        evaluate: async () => ({
          success: false,
          feedback: [collectModelOutputFeedback("always fails", "TEST")],
        }),
      })
    ).rejects.toThrow(/always fails/)
  })

  it("passes prior raw output to generate on repair attempts", async () => {
    const seenPrior: Array<string | undefined> = []
    await runModelRepairLoop({
      maxAttempts: 2,
      generate: async ({ attempt, priorRaw }) => {
        seenPrior.push(priorRaw)
        return { raw: attempt === 0 ? "first-output" : "second-output" }
      },
      evaluate: async (raw) => {
        if (raw === "second-output") {
          return { success: true, artifact: { ok: true }, feedback: [] }
        }
        return {
          success: false,
          feedback: [collectModelOutputFeedback("retry")],
        }
      },
    })
    expect(seenPrior).toEqual([undefined, "first-output"])
  })
})
