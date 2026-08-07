import { describe, expect, it } from "vitest"
import { detectHeader } from "../src/decode/parser.js"
import { eqlFormatOptionsSchema, resolveEqlOptions } from "../src/schemas.js"

describe("EQL schemas and header detection", () => {
  it("resolves format options", () => {
    expect(resolveEqlOptions({ headers: false }).headers).toBe(false)
    expect(resolveEqlOptions({ headers: "auto" }).headers).toBe(true)
    expect(resolveEqlOptions({ strict: false }).strict).toBe(false)
    expect(resolveEqlOptions({ quote: "always", indent: 4 }).indent).toBe(4)
  })

  it("parses options schema with passthrough", () => {
    const parsed = eqlFormatOptionsSchema.parse({ headers: false, custom: 1 })
    expect(parsed.headers).toBe(false)
    expect(parsed.custom).toBe(1)
  })

  it("detectHeader returns undefined for empty text", () => {
    expect(detectHeader("")).toBeUndefined()
    expect(detectHeader("WORKFLOW x")).toBeUndefined()
    expect(detectHeader("ECP @executioncontrolprotocol.workflow 1.0").schema).toBe("@executioncontrolprotocol.workflow")
  })
})
