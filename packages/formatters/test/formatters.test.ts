import { describe, expect, it } from "vitest"
import { JsonFormatter, ToonFormatter } from "../src/index.js"

describe("formatters", () => {
  it("JsonFormatter pretty-prints with stable key order", () => {
    const json = new JsonFormatter()
    const text = json.format({ b: 1, a: { d: 2, c: 3 } })
    expect(json.mediaType).toBe("application/json")
    expect(text).toBe(`{
  "a": {
    "c": 3,
    "d": 2
  },
  "b": 1
}
`)
  })

  it("ToonFormatter encodes a value", () => {
    const toon = new ToonFormatter()
    const text = toon.format({ hello: "world" })
    expect(toon.mediaType).toBe("text/toon")
    expect(text.length).toBeGreaterThan(0)
    expect(text).toContain("hello")
  })

  it("JsonFormatter handles arrays, nulls and primitives", () => {
    const json = new JsonFormatter()
    expect(json.format([1, { b: 1, a: 2 }])).toContain('"a"')
    expect(json.format(null).trim()).toBe("null")
    expect(json.format(3).trim()).toBe("3")
  })
})
