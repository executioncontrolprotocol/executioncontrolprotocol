import { describe, expect, it } from "vitest"
import {
  evalSerializableFunction,
  expr,
  isSerializableFunction,
  serializeFunction,
} from "../../src/index.js"

describe("serializable function / expr", () => {
  it("serializes a predicate to $fn source", () => {
    const value = expr((state) => state.expand !== false)
    expect(isSerializableFunction(value)).toBe(true)
    expect(value.$fn).toBe(true)
    expect(value.params).toEqual(["state"])
    expect(value.source).toMatch(/expand/)
  })

  it("rejects native functions", () => {
    expect(() => serializeFunction(Math.max as (...args: never[]) => unknown)).toThrow(
      /native or bound/
    )
  })

  it("rehydrates and evaluates against state", () => {
    const value = expr((state) => state.expand !== false)
    expect(evalSerializableFunction(value, { expand: false })).toBe(false)
    expect(evalSerializableFunction(value, { expand: true })).toBe(true)
    expect(evalSerializableFunction(value, {})).toBe(true)
  })

  it("rejects non-$fn shapes via isSerializableFunction", () => {
    expect(isSerializableFunction({ eq: ["x", 1] })).toBe(false)
    expect(isSerializableFunction({ $fn: true, source: "" })).toBe(false)
  })
})
