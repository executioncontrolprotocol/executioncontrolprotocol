import { isFileRefJsonSchema, parseXEcpFile } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"

describe("file schema helpers", () => {
  it("parses x-ecp-file object and legacy true", () => {
    expect(parseXEcpFile({ "x-ecp-file": true })).toEqual({})
    expect(parseXEcpFile({ "x-ecp-file": { access: "url", mediaTypes: ["image/*"] } })).toEqual({
      access: "url",
      mediaTypes: ["image/*"],
    })
  })

  it("detects FileRef JSON Schemas", () => {
    expect(isFileRefJsonSchema({ "x-ecp-file": { access: "url" } })).toBe(true)
    expect(isFileRefJsonSchema({ type: "string" })).toBe(false)
  })
})