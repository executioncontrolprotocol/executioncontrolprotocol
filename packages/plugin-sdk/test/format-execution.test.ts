import { describe, expect, it } from "vitest"
import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/core/types"
import { formatExecutionReport } from "../src/format-execution.js"

describe("formatExecutionReport", () => {
  it("prints run identity, step output, ECP_* code, and details without a STEP FAILED banner", () => {
    const text = formatExecutionReport({
      schema: "@executioncontrolprotocol.run.result",
      version: LATEST_ECP_VERSION,
      run: { id: "run-1", status: "failed" },
      history: {
        call: {
          status: "failed",
          output: { partial: true },
          diagnostics: [
            {
              code: "ECP_STEP_FAILED",
              message: "HTTP 400 for https://example.test/v1/jobs",
              details: { status: 400, bodyText: '{"error":"bad"}', url: "https://example.test/v1/jobs" },
            },
          ],
        },
      },
    })
    expect(text).toContain("Run run-1  status: failed")
    expect(text).toContain("Step call")
    expect(text).toContain("Error Code: ECP_STEP_FAILED")
    expect(text).toContain("Failure: HTTP 400 for https://example.test/v1/jobs")
    expect(text).toContain('Full Message: {"error":"bad"}')
    expect(text).toContain('"partial": true')
    expect(text).not.toMatch(/STEP FAILED/i)
  })

  it("prints a successful run without an error code", () => {
    const text = formatExecutionReport({
      schema: "@executioncontrolprotocol.run.result",
      version: LATEST_ECP_VERSION,
      run: { id: "run-2", status: "completed" },
      history: {
        echo: { status: "completed", output: { echo: "hi" } },
      },
    })
    expect(text).toContain("Run run-2  status: completed")
    expect(text).toContain("Step echo")
    expect(text).toContain('"echo": "hi"')
    expect(text).not.toContain("Error Code:")
  })

  it("prints an invoke record", () => {
    const text = formatExecutionReport({
      runId: "inv-1",
      stepId: "invoke",
      capabilityId: "@executioncontrolprotocol/test.echo",
      status: "failed",
      diagnostics: [{ code: "ECP_CAPABILITY_UNKNOWN", message: "Capability not registered: x" }],
    })
    expect(text).toContain("Run inv-1  status: failed")
    expect(text).toContain("Step invoke")
    expect(text).toContain("Error Code: ECP_CAPABILITY_UNKNOWN")
  })

  it("returns undefined for non-execution documents", () => {
    expect(formatExecutionReport({ capabilities: [] })).toBeUndefined()
    expect(formatExecutionReport("hello")).toBeUndefined()
  })
})
