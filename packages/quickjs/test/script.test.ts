import { describe, expect, it } from "vitest"
import { QuickJsExpressionEngine, ScriptEvaluationError } from "../src/index.js"

async function withEngine(
  options: { transformOptions?: { timeoutMs?: number }; options?: { timeoutMs?: number } } | undefined,
  run: (engine: QuickJsExpressionEngine) => Promise<void>,
): Promise<void> {
  const engine = new QuickJsExpressionEngine(options)
  await engine.start()
  try {
    await run(engine)
  } finally {
    await engine.stop()
  }
}

describe("QuickJsExpressionEngine evaluateScript", () => {
  it("reads frozen input and returns JSON", async () => {
    await withEngine(undefined, async (engine) => {
      await expect(engine.evaluateScript("return { sum: input.a + input.b }", { a: 1, b: 2 })).resolves.toEqual({
        sum: 3,
      })
    })
  })

  it("rejects input mutation and script throws", async () => {
    await withEngine(undefined, async (engine) => {
      const input = { n: 1 }
      await expect(
        engine.evaluateScript("input.n = 9; return input.n", input),
      ).rejects.toBeInstanceOf(ScriptEvaluationError)
      expect(input.n).toBe(1)
      await expect(engine.evaluateScript("throw new Error('nope')", {})).rejects.toMatchObject({
        code: "ECP_SCRIPT_FAILED",
        message: "nope",
      })
    })
  })

  it("times out under the transform budget without changing the expression budget", async () => {
    await withEngine({ transformOptions: { timeoutMs: 30 }, options: { timeoutMs: 200 } }, async (engine) => {
      await expect(engine.evaluateScript("while (true) {}", {})).rejects.toMatchObject({ code: "ECP_SCRIPT_TIMEOUT" })
      await expect(engine.evaluate("(state) => { while (true) {} }", {}, "value")).rejects.toMatchObject({
        code: "ECP_EXPR_TIMEOUT",
      })
    })
  })

  it("rejects undefined and oversized JSON results", async () => {
    await withEngine(
      { transformOptions: { maxResultBytes: 32 } },
      async (engine) => {
        await expect(engine.evaluateScript("return undefined", {})).rejects.toMatchObject({ code: "ECP_OUTPUT_INVALID" })
        await expect(engine.evaluateScript('return "x".repeat(40)', {})).rejects.toMatchObject({ code: "ECP_OUTPUT_INVALID" })
      },
    )
  })

  it("starts the runtime on first script evaluation", async () => {
    const engine = new QuickJsExpressionEngine()
    await expect(engine.evaluateScript("return 1", {})).resolves.toBe(1)
    await engine.stop()
  })
})