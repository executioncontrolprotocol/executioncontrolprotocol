import { describe, expect, it } from "vitest"
import type { HarnessRunContext } from "@executioncontrolprotocol/types"
import {
  formatRunContextSummaryLines,
  formatStepFailureMessage,
  summarizeHarnessRunContext,
} from "../../src/harness/authoring/summarize-run-context.js"

describe("summarizeHarnessRunContext", () => {
  it("includes diagnostic text for failed steps", () => {
    const context: HarnessRunContext = {
      run: {
        schema: "@executioncontrolprotocol.run.result",
        version: "1.0",
        run: { id: "run-1", status: "failed" },
        history: {
          echo: {
            status: "failed",
            diagnostics: [
              {
                severity: "error",
                code: "INVOKE_INPUT_INVALID",
                message: "Invoke input validation failed: value: Expected string",
              },
              {
                severity: "error",
                code: "INVALID_TYPE",
                message: "Expected string",
                path: "value",
              },
            ],
          },
        },
      },
      workflow: {
        schema: "@executioncontrolprotocol.workflow",
        version: "1.0",
        workflow: { id: "wf", label: "Demo" },
        steps: [],
      },
    }
    const summary = summarizeHarnessRunContext(context)
    expect(summary.failedSteps).toEqual([
      {
        stepId: "echo",
        status: "failed",
        message: "value: Expected string",
      },
    ])
    const lines = formatRunContextSummaryLines(context)
    expect(lines).toContain("Failed steps:")
    expect(lines).toContain("- echo: failed — value: Expected string")
  })

  it("omits message when a failed step has no diagnostics", () => {
    expect(formatStepFailureMessage(undefined)).toBeUndefined()
    expect(
      summarizeHarnessRunContext({
        run: {
          schema: "@executioncontrolprotocol.run.result",
          version: "1.0",
          run: { id: "r", status: "failed" },
          history: { s1: { status: "failed" } },
        },
      }).failedSteps
    ).toEqual([{ stepId: "s1", status: "failed", message: undefined }])
  })
})
