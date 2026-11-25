import { describe, expect, it } from "vitest"
import { ExpressionEvaluationError, QuickJsExpressionEngine, ScriptEvaluationError } from "../src/index.js"

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

describe("QuickJsExpressionEngine.evaluateScript", () => {
  it("returns JSON from input and rejects undefined, thrown errors and oversize results", async () => {
    const engine = new QuickJsExpressionEngine()
    await expect(
      engine.evaluateScript('return { name: input.value }', { value: "x" }),
    ).resolves.toEqual({ name: "x" })
    await expect(engine.evaluateScript("return;", {})).rejects.toMatchObject({ code: "ECP_OUTPUT_INVALID" })
    await expect(engine.evaluateScript("throw new Error('nope')", {})).rejects.toMatchObject({
      code: "ECP_SCRIPT_FAILED",
      message: "nope",
    })
    const capped = new QuickJsExpressionEngine({ transformOptions: { maxResultBytes: 16 } })
    await expect(
      capped.evaluateScript("return { blob: 'x'.repeat(100) }", {}),
    ).rejects.toMatchObject({ code: "ECP_OUTPUT_INVALID" })
  })

  it("times out under the transform budget and freezes input", async () => {
    const engine = new QuickJsExpressionEngine({ transformOptions: { timeoutMs: 50 } })
    await expect(engine.evaluateScript("while (true) {}", {})).rejects.toBeInstanceOf(ScriptEvaluationError)
    await expect(engine.evaluateScript("while (true) {}", {})).rejects.toMatchObject({ code: "ECP_SCRIPT_TIMEOUT" })
    const input = { n: 1, nested: { n: 1 } }
    await expect(
      engine.evaluateScript("input.n = 9; input.nested.n = 9; return input.nested.n", input),
    ).rejects.toMatchObject({ code: "ECP_SCRIPT_FAILED" })
    expect(input).toEqual({ n: 1, nested: { n: 1 } })
  })
})
