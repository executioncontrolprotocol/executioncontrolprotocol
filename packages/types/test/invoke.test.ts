import { describe, expect, it } from "vitest"
import { ECP_INVOKE_ERROR_CODES, httpStatusForInvokeResult, type InvokeResult } from "../src/index.js"

function result(code?: string, success = false): InvokeResult {
  return {
    schema: "@executioncontrolprotocol.invoke.result",
    version: "1.0",
    success,
    capabilityId: "@executioncontrolprotocol/test.echo",
    diagnostics: code ? [{ severity: "error", code, message: code }] : [],
  }
}

describe("httpStatusForInvokeResult", () => {
  it("returns 200 for success", () => {
    expect(httpStatusForInvokeResult(result(undefined, true))).toBe(200)
  })

  it("maps capability miss to 404", () => {
    expect(httpStatusForInvokeResult(result(ECP_INVOKE_ERROR_CODES.CAPABILITY_NOT_FOUND))).toBe(404)
  })

  it("maps invalid input and output to 400", () => {
    expect(httpStatusForInvokeResult(result(ECP_INVOKE_ERROR_CODES.INVOKE_INPUT_INVALID))).toBe(400)
    expect(httpStatusForInvokeResult(result(ECP_INVOKE_ERROR_CODES.INVOKE_OUTPUT_INVALID))).toBe(400)
  })

  it("maps denied to 403 and unpaired to 503", () => {
    expect(httpStatusForInvokeResult(result(ECP_INVOKE_ERROR_CODES.INVOKE_DENIED))).toBe(403)
    expect(httpStatusForInvokeResult(result(ECP_INVOKE_ERROR_CODES.REMOTE_INVOKE_REQUIRED))).toBe(503)
  })

  it("maps failed and unknown codes to 500", () => {
    expect(httpStatusForInvokeResult(result(ECP_INVOKE_ERROR_CODES.INVOKE_FAILED))).toBe(500)
    expect(httpStatusForInvokeResult(result("OTHER"))).toBe(500)
  })
})
