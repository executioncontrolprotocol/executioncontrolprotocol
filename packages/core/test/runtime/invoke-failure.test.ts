import { describe, expect, it } from "vitest"
import { ECP_INVOKE_ERROR_CODES, LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"
import {
  buildInvokeFailureDiagnostics,
  formatValidationIssueLine,
  invokeFailure,
} from "../../src/runtime/remote-invoke.js"

describe("invokeFailure diagnostics", () => {
  it("keeps a single diagnostic when validation has no errors", () => {
    const result = invokeFailure(
      "@executioncontrolprotocol/test.echo",
      ECP_INVOKE_ERROR_CODES.INVOKE_FAILED,
      "boom"
    )
    expect(result.diagnostics).toEqual([
      { severity: "error", code: ECP_INVOKE_ERROR_CODES.INVOKE_FAILED, message: "boom" },
    ])
  })

  it("expands validation.errors into lead + per-issue diagnostics", () => {
    const validation = {
      schema: "@executioncontrolprotocol.validation.result" as const,
      version: LATEST_ECP_VERSION,
      valid: false,
      errors: [
        { code: "INVALID_TYPE", message: "Expected string", path: "value" },
        { code: "TOO_SMALL", message: "Required", path: "name" },
      ],
      warnings: [],
    }
    const diagnostics = buildInvokeFailureDiagnostics(
      ECP_INVOKE_ERROR_CODES.INVOKE_INPUT_INVALID,
      "Invoke input validation failed",
      validation
    )
    expect(diagnostics[0]).toEqual({
      severity: "error",
      code: ECP_INVOKE_ERROR_CODES.INVOKE_INPUT_INVALID,
      message:
        "Invoke input validation failed: value: Expected string; name: Required",
    })
    expect(diagnostics.slice(1)).toEqual([
      {
        code: "INVALID_TYPE",
        message: "Expected string",
        path: "value",
        severity: "error",
      },
      {
        code: "TOO_SMALL",
        message: "Required",
        path: "name",
        severity: "error",
      },
    ])
    expect(invokeFailure("cap", ECP_INVOKE_ERROR_CODES.INVOKE_INPUT_INVALID, "summary", validation).diagnostics)
      .toHaveLength(3)
  })

  it("formats issue lines with and without path", () => {
    expect(formatValidationIssueLine({ code: "X", message: "msg", path: "a.b" })).toBe("a.b: msg")
    expect(formatValidationIssueLine({ code: "X", message: "msg" })).toBe("msg")
  })
})
