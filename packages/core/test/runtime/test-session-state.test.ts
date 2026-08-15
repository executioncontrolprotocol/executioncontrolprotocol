import { describe, expect, it } from "vitest"
import type { StepRunRecord, WorkflowManifest } from "@executioncontrolprotocol/types"
import {
  clearDownstreamTestState,
  flattenTestStepOrder,
  findTestStep,
  isLastTestStep,
} from "../../src/runtime/test-session-state.js"

const workflow: WorkflowManifest = {
  schema: "@executioncontrolprotocol.workflow",
  version: "1.0",
  workflow: { id: "t" },
  steps: [
    {
      id: "a",
      uses: "@executioncontrolprotocol/test.echo",
      as: "first",
    },
    {
      id: "b",
      uses: "@executioncontrolprotocol/test.echo",
      as: "second",
    },
    {
      id: "c",
      uses: "@executioncontrolprotocol/test.echo",
      as: "third",
    },
  ],
}

describe("test-session-state", () => {
  it("flattens leaf step order", () => {
    expect(flattenTestStepOrder(workflow.steps).map((s) => s.id)).toEqual(["a", "b", "c"])
  })

  it("finds steps and last-step", () => {
    expect(findTestStep(workflow, "b")?.as).toBe("second")
    expect(isLastTestStep(workflow, "c")).toBe(true)
    expect(isLastTestStep(workflow, "a")).toBe(false)
  })

  it("clears only downstream history and as-keys", () => {
    const state: Record<string, unknown> = {
      first: { echo: 1 },
      second: { echo: 2 },
      third: { echo: 3 },
    }
    const history: Record<string, StepRunRecord> = {
      a: { status: "completed" },
      b: { status: "completed" },
      c: { status: "completed" },
    }
    clearDownstreamTestState(workflow, state, history, "a")
    expect(state).toEqual({ first: { echo: 1 } })
    expect(history).toEqual({ a: { status: "completed" } })
  })
})
