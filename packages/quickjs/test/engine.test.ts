import { describe, expect, it } from "vitest"
import { ExpressionEvaluationError, QuickJsExpressionEngine } from "../src/index.js"

async function withEngine(
  options: { timeoutMs?: number; memoryBytes?: number; maxResultBytes?: number } | undefined,
  run: (engine: QuickJsExpressionEngine) => Promise<void>,
): Promise<void> {
  const engine = new QuickJsExpressionEngine({ options })
  await engine.start()
  try {
    await run(engine)
  } finally {
    await engine.stop()
  }
}

describe("QuickJsExpressionEngine", () => {
  it("returns a boolean from a control expression and a value from a value expression", async () => {
    await withEngine(undefined, async (engine) => {
      await expect(engine.evaluate("(state) => state.ok === true", { ok: true }, "control")).resolves.toBe(true)
      await expect(engine.evaluate("(state) => state.n + 1", { n: 1 }, "value")).resolves.toBe(2)
    })
  })

  it("rejects a non-boolean control result and a thrown error", async () => {
    await withEngine(undefined, async (engine) => {
      await expect(engine.evaluate("(state) => 1", {}, "control")).rejects.toMatchObject({
        code: "ECP_EXPR_RESULT_INVALID",
      })
      await expect(engine.evaluate("(state) => { throw new Error('nope') }", {}, "value")).rejects.toMatchObject({
        code: "ECP_EXPR_FAILED",
        message: "nope",
      })
    })
  })

  it("times out an infinite loop, rejects a huge result, and does not leak host objects or state mutations", async () => {
    await withEngine({ timeoutMs: 50, maxResultBytes: 32 }, async (engine) => {
      await expect(engine.evaluate("(state) => { while (true) {} }", {}, "value")).rejects.toBeInstanceOf(
        ExpressionEvaluationError,
      )
      await expect(engine.evaluate("(state) => { while (true) {} }", {}, "value")).rejects.toMatchObject({
        code: "ECP_EXPR_TIMEOUT",
      })
      await expect(engine.evaluate("(state) => 'x'.repeat(1000)", {}, "value")).rejects.toMatchObject({
        code: "ECP_EXPR_FAILED",
      })
      await expect(engine.evaluate("(state) => typeof process", {}, "value")).resolves.toBe("undefined")
      await expect(engine.evaluate("(state) => typeof require", {}, "value")).resolves.toBe("undefined")
      await expect(engine.evaluate("(state) => typeof fetch", {}, "value")).resolves.toBe("undefined")
      const state = { n: 1, nested: { n: 1 } }
      await expect(
        engine.evaluate("(state) => { state.n = 9; state.nested.n = 9; return state.nested.n }", state, "value"),
      ).resolves.toBe(1)
      expect(state).toEqual({ n: 1, nested: { n: 1 } })
      await expect(engine.evaluate("(state) => { globalThis.leaked = 1; return true }", {}, "control")).resolves.toBe(
        true,
      )
      await expect(engine.evaluate("(state) => globalThis.leaked === undefined", {}, "control")).resolves.toBe(true)
    })
  })

  it("starts lazily, ignores a second start, and rejects a non-JSON result", async () => {
    const engine = new QuickJsExpressionEngine()
    await expect(engine.evaluate("(state) => state", { ok: true }, "value")).resolves.toEqual({ ok: true })
    await engine.start()
    await expect(engine.evaluate("(state) => undefined", {}, "value")).rejects.toMatchObject({
      code: "ECP_EXPR_RESULT_INVALID",
    })
    await engine.stop()
  })

  it("fails when the runtime runs out of memory", async () => {
    await withEngine({ timeoutMs: 2000, memoryBytes: 256 * 1024 }, async (engine) => {
      await expect(
        engine.evaluate("(state) => { const items = []; while (true) items.push(new Array(1000).fill('x')) }", {}, "value"),
      ).rejects.toMatchObject({ code: "ECP_EXPR_FAILED" })
    })
  })
})
