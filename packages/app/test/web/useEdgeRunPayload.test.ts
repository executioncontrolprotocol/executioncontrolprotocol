import { describe, expect, it } from "vitest"
import { formatPayloadJson, truncatePayloadPreview } from "../../src/web/hooks/useEdgeRunPayload.js"

describe("truncatePayloadPreview", () => {
  it("returns short text unchanged", () => {
    expect(truncatePayloadPreview('{"a":1}')).toEqual({ preview: '{"a":1}', truncated: false })
  })

  it("truncates very large JSON", () => {
    const text = "x".repeat(1_500)
    const result = truncatePayloadPreview(text)
    expect(result.truncated).toBe(true)
    expect(result.preview.length).toBeLessThan(text.length)
    expect(result.preview).toContain("…")
  })
})

describe("formatPayloadJson", () => {
  it("formats objects and returns empty for undefined", () => {
    expect(formatPayloadJson(undefined)).toBe("")
    expect(formatPayloadJson({ ok: true })).toContain('"ok": true')
  })

  it("stringifies values that are not JSON-serializable", () => {
    const circular: { self?: unknown } = {}
    circular.self = circular
    expect(formatPayloadJson(circular)).toContain("[object Object]")
  })
})