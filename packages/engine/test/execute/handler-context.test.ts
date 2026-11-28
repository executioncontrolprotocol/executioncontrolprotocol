import { describe, expect, it, vi } from "vitest"
import { createHandlerContext, deepFreeze } from "../../src/execute/handler-context.js"

describe("deepFreeze", () => {
  it("returns primitives unchanged", () => {
    expect(deepFreeze(1)).toBe(1)
    expect(deepFreeze("x")).toBe("x")
    expect(deepFreeze(null)).toBeNull()
  })

  it("freezes nested objects", () => {
    const value = deepFreeze({ a: { b: 1 } })
    expect(Object.isFrozen(value)).toBe(true)
    expect(Object.isFrozen((value as { a: object }).a)).toBe(true)
    expect(deepFreeze(value)).toBe(value)
  })

  it("freezes array entries", () => {
    const value = deepFreeze([1, { nested: true }])
    expect(Object.isFrozen(value)).toBe(true)
    expect(Object.isFrozen((value as object[])[1])).toBe(true)
  })
})

describe("createHandlerContext", () => {
  it("includes optional round and expression fields", () => {
    const store = { staged: {}, commit: vi.fn() }
    const context = createHandlerContext({
      config: { token: "x" },
      signal: new AbortController().signal,
      init: {
        runId: "run-1",
        stepId: "step-1",
        state: { ok: true },
        round: 2,
        expression: "input.x",
      },
      store: store as never,
      deps: {
        files: {} as never,
        call: vi.fn(),
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        usage: { record: vi.fn() },
      },
    })
    expect(context.step.round).toBe(2)
    expect(context.expression).toBe("input.x")
    expect(Object.isFrozen(context.state)).toBe(true)
  })

  it("omits round and expression when absent", () => {
    const context = createHandlerContext({
      config: undefined,
      signal: new AbortController().signal,
      init: {
        runId: "run-1",
        stepId: "step-1",
        state: {},
      },
      store: { staged: {}, commit: vi.fn() } as never,
      deps: {
        files: {} as never,
        call: vi.fn(),
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        usage: { record: vi.fn() },
      },
    })
    expect("round" in context.step).toBe(false)
    expect("expression" in context).toBe(false)
  })
})