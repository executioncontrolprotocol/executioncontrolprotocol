import { describe, expect, it } from "vitest"
import { ECP_INPUT_INVALID, EcpError } from "@executioncontrolprotocol/core/types"
import { toolCaught, toolFail, toolOk } from "../src/result.js"

describe("tool result helpers", () => {
  it("wraps success data", () => {
    expect(JSON.parse(toolOk({ a: 1 }).content[0]!.text)).toEqual({ ok: true, data: { a: 1 } })
  })

  it("wraps a structured failure", () => {
    const result = toolFail({ code: ECP_INPUT_INVALID, message: "bad" })
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      ok: false,
      error: { code: ECP_INPUT_INVALID, message: "bad" },
    })
  })

  it("maps EcpError, Error, and unknown throws", () => {
    const typed = toolCaught(new EcpError(ECP_INPUT_INVALID, "nope", { path: "x" }))
    expect(JSON.parse(typed.content[0]!.text).error).toMatchObject({
      code: ECP_INPUT_INVALID,
      path: "x",
    })
    const plain = toolCaught(new Error("boom"))
    expect(JSON.parse(plain.content[0]!.text).error.message).toBe("boom")
    const unknown = toolCaught(42)
    expect(JSON.parse(unknown.content[0]!.text).error.message).toBe("42")
  })
})
