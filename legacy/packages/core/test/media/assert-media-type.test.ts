import { describe, expect, it } from "vitest"
import { assertMediaType, mediaTypeMatches } from "../../src/media/assert-media-type.js"

describe("assertMediaType", () => {
  it("accepts exact MIME matches", () => {
    expect(() => assertMediaType("image/png", "image/png")).not.toThrow()
  })

  it("accepts wildcard image/* matches", () => {
    expect(() => assertMediaType("image/png", "image/*")).not.toThrow()
    expect(() => assertMediaType("image/jpeg", "image/*")).not.toThrow()
  })

  it("rejects non-matching types for wildcards", () => {
    expect(() => assertMediaType("application/pdf", "image/*")).toThrow(/not allowed/)
  })

  it("rejects missing or empty resolved media types", () => {
    expect(() => assertMediaType(undefined, "image/*")).toThrow(/missing or empty/)
    expect(() => assertMediaType("  ", "image/*")).toThrow(/missing or empty/)
  })

  it("matches when any allowed entry matches", () => {
    expect(mediaTypeMatches("image/png", ["application/pdf", "image/png"])).toBe(true)
    expect(mediaTypeMatches("text/plain", ["application/pdf", "image/png"])).toBe(false)
  })
})
