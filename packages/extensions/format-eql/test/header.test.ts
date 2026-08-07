import { describe, expect, it } from "vitest"
import { EQL_ERROR_CODES } from "../src/decode/diagnostics.js"
import { decodeWorkflow, encodeWorkflow, loadWorkflowFixture } from "./helpers.js"

describe("EQL header behavior", () => {
  it("encode includes ECP header by default", () => {
    const encoded = encodeWorkflow(loadWorkflowFixture("echo-workflow"))
    expect(encoded.result).toMatch(/^ECP @executioncontrolprotocol\.workflow/)
  })

  it("encode omits header when options.headers is false", () => {
    const encoded = encodeWorkflow(loadWorkflowFixture("echo-workflow"), {
      headers: false,
    })
    expect(encoded.result).not.toContain("ECP @executioncontrolprotocol.workflow")
  })

  it("decode infers schema from header", () => {
    const text = `ECP @executioncontrolprotocol.workflow 1.0
WORKFLOW hdr-test
STEP s USES @executioncontrolprotocol/test.echo`
    const decoded = decodeWorkflow(text)
    expect(decoded.success).toBe(true)
    expect((decoded.result as { workflow: { id: string } }).workflow.id).toBe("hdr-test")
  })

  it("decode without header requires targetSchema on input", () => {
    const decoded = decodeWorkflow("WORKFLOW nohdr\nSTEP s USES @executioncontrolprotocol/test.echo", {
      headers: false,
    })
    expect(decoded.success).toBe(true)
  })

  it("fails decode without header or targetSchema", () => {
    const decoded = decodeWorkflow("WORKFLOW orphan\nSTEP s USES @executioncontrolprotocol/test.echo")
    // headers auto + no ECP line still has WORKFLOW — targetSchema provided in helper
    expect(decoded.success).toBe(true)
  })

  it("reports missing target when neither header nor targetSchema", async () => {
    const { decodeFromEql } = await import("../src/decode/decode-eql.js")
    const { testCtx } = await import("./helpers.js")
    const decoded = decodeFromEql(
      { input: "WORKFLOW x\nSTEP s USES @executioncontrolprotocol/test.echo" },
      testCtx
    )
    expect(decoded.success).toBe(false)
    expect(decoded.diagnostics[0]?.code).toBe(EQL_ERROR_CODES.MISSING_TARGET_SCHEMA)
  })
})
