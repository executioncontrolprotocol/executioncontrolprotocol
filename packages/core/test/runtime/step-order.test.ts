import { describe, expect, it } from "vitest"
import type { StepRunRecord, WorkflowManifest } from "@executioncontrolprotocol/core/types"
import {
  clearDownstreamState,
  clearFromStep,
  flattenStepOrder,
  findStep,
  isLastStep,
  canonicalStepDefinition,
} from "../../src/runtime/step-order.js"

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

describe("step-order", () => {
  it("flattens leaf step order", () => {
    expect(flattenStepOrder(workflow.steps).map((s) => s.id)).toEqual(["a", "b", "c"])
  })

  it("finds steps and last-step", () => {
    expect(findStep(workflow, "b")?.as).toBe("second")
    expect(isLastStep(workflow, "c")).toBe(true)
    expect(isLastStep(workflow, "a")).toBe(false)
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
    clearDownstreamState(workflow, state, history, "a")
    expect(state).toEqual({ first: { echo: 1 } })
    expect(history).toEqual({ a: { status: "completed" } })
  })

  it("clears from a step inclusive", () => {
    const state: Record<string, unknown> = { first: 1, second: 2 }
    const history: Record<string, StepRunRecord> = {
      a: { status: "completed" },
      b: { status: "completed" },
    }
    clearFromStep(workflow, state, history, "a")
    expect(state).toEqual({})
    expect(history).toEqual({})
  })

  it("canonicalizes a step definition", () => {
    const step = findStep(workflow, "a")!
    expect(canonicalStepDefinition(step)).toContain('"id":"a"')
  })
})
