import { describe, expect, it } from "vitest"
import { ECP_ENCODING_ERROR_CODES } from "@executioncontrolprotocol/types"
import { encodeToEql } from "../src/encode/encode-eql.js"
import { decodeFromEql } from "../src/decode/decode-eql.js"
import { EQL_ERROR_CODES } from "../src/decode/diagnostics.js"
import { encodeWorkflow, loadWorkflowFixture, testCtx } from "./helpers.js"

describe("EQL unsupported schema handling", () => {
  it("encode fails for unknown sourceSchema", () => {
    expect(() =>
      encodeToEql(
        { source: { schema: "@executioncontrolprotocol.unknown" }, sourceSchema: "@executioncontrolprotocol.unknown" },
        testCtx
      )
    ).toThrow(expect.objectContaining({
      code: ECP_ENCODING_ERROR_CODES.FORMAT_UNSUPPORTED_SOURCE_SCHEMA,
    }))
  })

  it("encode fails when schema cannot be inferred", () => {
    expect(() => encodeToEql({ source: { foo: 1 } }, testCtx)).toThrow(
      expect.objectContaining({
        code: ECP_ENCODING_ERROR_CODES.FORMAT_UNSUPPORTED_SOURCE_SCHEMA,
      })
    )
  })

  it("decode fails when document kind mismatches targetSchema", () => {
    const encoded = encodeWorkflow(loadWorkflowFixture("echo-workflow"), {
      headers: false,
    })
    const decoded = decodeFromEql(
      {
        input: encoded.result,
        targetSchema: "@executioncontrolprotocol.intent",
        options: { headers: false },
      },
      testCtx
    )
    expect(decoded.success).toBe(false)
    expect(decoded.diagnostics[0]?.code).toBe(EQL_ERROR_CODES.UNSUPPORTED_SCHEMA)
  })

  it("decode rejects unsupported targetSchema", () => {
    const decoded = decodeFromEql(
      {
        input: "INTENT workflow-create",
        targetSchema: "@executioncontrolprotocol.unknown",
        options: { headers: false },
      },
      testCtx
    )
    expect(decoded.success).toBe(false)
    expect(decoded.diagnostics[0]?.code).toBe(EQL_ERROR_CODES.UNSUPPORTED_SCHEMA)
  })

  it("decode reports schema mismatch between header and targetSchema", () => {
    const patchText = `ECP @executioncontrolprotocol.patch 1.0
PATCH WORKFLOW x
UPDATE STEP s
  LABEL "x"`
    const decoded = decodeFromEql(
      {
        input: patchText,
        targetSchema: "@executioncontrolprotocol.workflow",
      },
      testCtx
    )
    expect(decoded.success).toBe(false)
    expect(decoded.diagnostics.some((d) => d.code === EQL_ERROR_CODES.UNSUPPORTED_SCHEMA)).toBe(
      true
    )
  })
})
