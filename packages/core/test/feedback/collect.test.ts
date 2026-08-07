import { describe, expect, it } from "vitest"
import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"
import {
  collectDecodeFeedback,
  collectPatchFeedback,
  collectValidationFeedback,
  flattenHarnessFeedbackIssues,
} from "../../src/feedback/collect.js"

describe("harness feedback collectors", () => {
  it("collectDecodeFeedback merges diagnostics and validation issues with paths", () => {
    const feedback = collectDecodeFeedback({
      schema: "@executioncontrolprotocol.decode.result",
      version: LATEST_ECP_VERSION,
      success: false,
      targetSchema: "@executioncontrolprotocol.intent",
      diagnostics: [
        {
          severity: "error",
          code: "FORMAT_DECODE_FAILED",
          message: "JSON parse failed: unexpected",
        },
      ],
      validation: {
        schema: "@executioncontrolprotocol.validation.result",
        version: LATEST_ECP_VERSION,
        valid: false,
        errors: [
          {
            severity: "error",
            code: "INVALID_LITERAL",
            message: "Required",
            path: "schema",
          },
        ],
        warnings: [],
      },
    })

    expect(feedback.stage).toBe("decode")
    expect(feedback.success).toBe(false)
    expect(feedback.targetSchema).toBe("@executioncontrolprotocol.intent")
    expect(feedback.issues.some((i) => i.path === "schema")).toBe(true)
    expect(feedback.issues.some((i) => i.code === "FORMAT_DECODE_FAILED")).toBe(true)
  })

  it("collectPatchFeedback includes applied entry diagnostics", () => {
    const feedback = collectPatchFeedback({
      schema: "@executioncontrolprotocol.patch.result",
      version: LATEST_ECP_VERSION,
      success: false,
      targetSchema: "@executioncontrolprotocol.workflow",
      applied: [
        {
          path: "steps[missing].label",
          mode: "merge",
          success: false,
          diagnostics: [
            {
              severity: "error",
              code: "PATCH_PATH_NOT_FOUND",
              message: "Step not found: missing",
            },
          ],
        },
      ],
      diagnostics: [],
      validation: {
        schema: "@executioncontrolprotocol.validation.result",
        version: LATEST_ECP_VERSION,
        valid: false,
        errors: [{ severity: "error", code: "INVALID_TYPE", message: "Required", path: "patches" }],
        warnings: [],
      },
    })

    expect(feedback.stage).toBe("patch-apply")
    expect(feedback.applied).toHaveLength(1)
    expect(feedback.issues.some((i) => i.path === "steps[missing].label")).toBe(true)
    expect(feedback.issues.some((i) => i.path === "patches")).toBe(true)
  })

  it("collectValidationFeedback passes through workflow validation", () => {
    const feedback = collectValidationFeedback({
      schema: "@executioncontrolprotocol.validation.result",
      version: LATEST_ECP_VERSION,
      valid: false,
      errors: [
        {
          severity: "error",
          code: "UNKNOWN_CAPABILITY",
          message: "Capability @executioncontrolprotocol/missing is not registered.",
          path: "steps.echo.uses",
          suggestions: ["@executioncontrolprotocol/test.echo"],
        },
      ],
      warnings: [],
    })

    expect(feedback.stage).toBe("validate")
    expect(feedback.issues[0]?.suggestions).toContain("@executioncontrolprotocol/test.echo")
  })

  it("flattenHarnessFeedbackIssues dedupes by path code and message", () => {
    const flat = flattenHarnessFeedbackIssues([
      collectDecodeFeedback({
        schema: "@executioncontrolprotocol.decode.result",
        version: LATEST_ECP_VERSION,
        success: false,
        diagnostics: [{ severity: "error", code: "A", message: "same", path: "x" }],
      }),
      collectValidationFeedback({
        schema: "@executioncontrolprotocol.validation.result",
        version: LATEST_ECP_VERSION,
        valid: false,
        errors: [{ severity: "error", code: "A", message: "same", path: "x" }],
        warnings: [],
      }),
    ])
    expect(flat).toHaveLength(1)
  })
})
