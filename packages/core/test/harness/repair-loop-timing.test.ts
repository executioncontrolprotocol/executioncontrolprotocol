import { afterEach, describe, expect, it, vi } from "vitest"
import { runModelRepairLoop } from "../../src/harness/run-model-repair-loop.js"
import { isHarnessTimingDebugEnabled } from "../../src/harness/repair-loop-timing.js"

describe("isHarnessTimingDebugEnabled", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns false when process is undefined (browser)", () => {
    vi.stubGlobal("process", undefined)
    expect(isHarnessTimingDebugEnabled()).toBe(false)
  })
})

describe("runModelRepairLoop timing", () => {
  it("records generateMs and evaluateMs when ECP_EVAL_DEBUG_TIMING is set", async () => {
    const prev = process.env.ECP_EVAL_DEBUG_TIMING
    process.env.ECP_EVAL_DEBUG_TIMING = "1"
    try {
      const result = await runModelRepairLoop({
        maxAttempts: 2,
        generate: async () => {
          await new Promise((r) => setTimeout(r, 5))
          return { raw: "ok" }
        },
        evaluate: async () => {
          await new Promise((r) => setTimeout(r, 2))
          return { success: true, artifact: { ok: true }, feedback: [] }
        },
      })
      expect(result.attempts[0]?.generateMs).toBeGreaterThanOrEqual(4)
      expect(result.attempts[0]?.evaluateMs).toBeGreaterThanOrEqual(1)
      expect(isHarnessTimingDebugEnabled()).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.ECP_EVAL_DEBUG_TIMING
      else process.env.ECP_EVAL_DEBUG_TIMING = prev
    }
  })

  it("omits timing fields when ECP_EVAL_DEBUG_TIMING is off", async () => {
    const prev = process.env.ECP_EVAL_DEBUG_TIMING
    delete process.env.ECP_EVAL_DEBUG_TIMING
    try {
      const result = await runModelRepairLoop({
        maxAttempts: 1,
        generate: async () => ({ raw: "x" }),
        evaluate: async () => ({
          success: true,
          artifact: { ok: true },
          feedback: [],
        }),
      })
      expect(result.attempts[0]?.generateMs).toBeUndefined()
      expect(result.attempts[0]?.evaluateMs).toBeUndefined()
    } finally {
      if (prev !== undefined) process.env.ECP_EVAL_DEBUG_TIMING = prev
    }
  })
})
