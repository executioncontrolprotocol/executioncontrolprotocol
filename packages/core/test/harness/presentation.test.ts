import { describe, expect, it } from "vitest"
import {
  formatStructuredRepairForModel,
  isRepairFeedbackEcho,
} from "@executioncontrolprotocol/core"

describe("isRepairFeedbackEcho", () => {
  it("detects echoed capability repair prose", () => {
    expect(
      isRepairFeedbackEcho(
        "Workflow must include steps for every required capability. Missing uses: @executioncontrolprotocol/test.validate."
      )
    ).toBe(true)
  })

  it("allows compact JSON workflow output", () => {
    expect(
      isRepairFeedbackEcho(
        '{"schema":"@executioncontrolprotocol.workflow","version":"1.0.0","steps":[]}'
      )
    ).toBe(false)
  })

  it("allows headerless EQL workflow output", () => {
    expect(
      isRepairFeedbackEcho(
        'WORKFLOW echo-test "Echo"\nSTEP echo USES @executioncontrolprotocol/test.echo\n  WITH value = "hello"'
      )
    ).toBe(false)
  })
})

describe("formatStructuredRepairForModel", () => {
  const feedback = [
    {
      source: "validation" as const,
      issues: [{ message: "exactly one step in .run([...])", code: "step-count" }],
    },
  ]

  it("defaults to EQL lead-in for nano callers", () => {
    const text = formatStructuredRepairForModel(feedback)
    expect(text).toContain("EQL only")
    expect(text).toContain("exactly one step")
  })

  it("uses TypeScript lead-in for coding surface", () => {
    const text = formatStructuredRepairForModel(feedback, "typescript")
    expect(text).toContain("TypeScript module")
    expect(text).not.toMatch(/EQL/i)
  })
})
