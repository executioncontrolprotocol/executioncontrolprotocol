import { describe, expect, it } from "vitest"
import { shouldApplyWatchedSource } from "../src/graph/index.js"

describe("shouldApplyWatchedSource", () => {
  it("replaces the buffer when local text matches the last acknowledged save", () => {
    expect(shouldApplyWatchedSource("export default 1", "export default 1")).toBe(true)
  })

  it("keeps a dirty buffer when local text differs from the last acknowledged save", () => {
    expect(shouldApplyWatchedSource("local draft", "export default 1")).toBe(false)
  })

  it("treats an empty local buffer as dirty against a non-empty acknowledged source", () => {
    expect(shouldApplyWatchedSource("", "export default 1")).toBe(false)
  })
})
