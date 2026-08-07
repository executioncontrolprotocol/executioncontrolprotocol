import { describe, expect, it } from "vitest"
import { isRepairFeedbackEcho } from "@executioncontrolprotocol/core"

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
      isRepairFeedbackEcho('{"schema":"@executioncontrolprotocol.workflow","version":"1.0.0","steps":[]}')
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
