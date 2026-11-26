import { describe, expect, it } from "vitest"
import { isExprMarker, isRefMarker, isScriptMarker, isStateMarker, refPathFromValue } from "../../src/graph/markers.js"

describe("graph markers", () => {
  it("detects marker shapes", () => {
    expect(isRefMarker({ $ref: "state.x" })).toBe(true)
    expect(isStateMarker({ $state: "state.x" })).toBe(true)
    expect(isExprMarker({ $expr: "1" })).toBe(true)
    expect(isScriptMarker({ $script: { source: "return 1" } })).toBe(true)
    expect(isRefMarker(null)).toBe(false)
    expect(isScriptMarker({ $script: "bad" })).toBe(false)
  })

  it("reads ref paths and ignores other values", () => {
    expect(refPathFromValue({ $ref: "state.a" })).toBe("state.a")
    expect(refPathFromValue({ $ref: ["state.b", "state.c"] })).toBe("state.b")
    expect(refPathFromValue({ $state: "state.b" })).toBeUndefined()
    expect(refPathFromValue({ value: 1 })).toBeUndefined()
  })
})