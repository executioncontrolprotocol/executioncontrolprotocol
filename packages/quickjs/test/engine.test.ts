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
  it("evaluates an expression over frozen input", async () => {
    await withEngine(undefined, async (engine) => {
      await expect(engine.evaluateExpression("input.ok === true", { ok: true })).resolves.toBe(true)
      await expect(engine.evaluateExpression("input.n + 1", { n: 1 })).resolves.toBe(2)
    })
  })

  it("returns thrown errors from expressions", async () => {
    await withEngine(undefined, async (engine) => {
      await expect(engine.evaluateExpression("(() => { throw new Error('nope') })()", {})).rejects.toMatchObject({
        code: "ECP_EXPR_FAILED",
        message: "nope",
      })
    })
  })

  it("times out an infinite loop, rejects a huge result, and does not leak host objects or input mutations", async () => {
    await withEngine({ timeoutMs: 50, maxResultBytes: 32 }, async (engine) => {
      await expect(engine.evaluateExpression("(() => { while (true) {} })()", {})).rejects.toBeInstanceOf(
        ExpressionEvaluationError,
      )
      await expect(engine.evaluateExpression("(() => { while (true) {} })()", {})).rejects.toMatchObject({
        code: "ECP_EXPR_TIMEOUT",
      })
      await expect(engine.evaluateExpression("'x'.repeat(1000)", {})).rejects.toMatchObject({
        code: "ECP_EXPR_FAILED",
      })
      await expect(engine.evaluateExpression("typeof process", {})).resolves.toBe("undefined")
      await expect(engine.evaluateExpression("typeof require", {})).resolves.toBe("undefined")
      await expect(engine.evaluateExpression("typeof fetch", {})).resolves.toBe("undefined")
      const input = { n: 1, nested: { n: 1 } }
      await expect(engine.evaluateExpression("input.nested.n", input)).resolves.toBe(1)
      expect(input).toEqual({ n: 1, nested: { n: 1 } })
    })
  })

  it("starts lazily, ignores a second start, and allows non-boolean results", async () => {
    const engine = new QuickJsExpressionEngine()
    await expect(engine.evaluateExpression("input", { ok: true })).resolves.toEqual({ ok: true })
    await engine.start()
    await expect(engine.evaluateExpression("null", {})).resolves.toBe(null)
    await engine.stop()
  })

  it("fails when the runtime runs out of memory", async () => {
    await withEngine({ timeoutMs: 2000, memoryBytes: 256 * 1024 }, async (engine) => {
      await expect(
        engine.evaluateExpression("(() => { const items = []; while (true) items.push(new Array(1000).fill('x')); return items.length })()", {}),
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
