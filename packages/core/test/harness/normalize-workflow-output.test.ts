import { describe, expect, it } from "vitest"
import { normalizeWorkflowDocumentCandidate } from "@executioncontrolprotocol/core"

describe("normalizeWorkflowDocumentCandidate", () => {
  it("hoists steps nested under workflow and fills schema/version", () => {
    const normalized = normalizeWorkflowDocumentCandidate({
      workflow: {
        id: "minimal-echo",
        label: "Minimal Echo",
        steps: [{ type: "step", id: "echo", uses: "@executioncontrolprotocol/test.echo" }],
      },
    }) as Record<string, unknown>

    expect(normalized.schema).toBe("@executioncontrolprotocol.workflow")
    expect(normalized.version).toBeTruthy()
    expect((normalized.workflow as Record<string, unknown>).id).toBe("minimal-echo")
    expect(normalized.steps).toHaveLength(1)
    expect((normalized.workflow as Record<string, unknown>).steps).toBeUndefined()
  })

  it("renames step inputs key to input", () => {
    const normalized = normalizeWorkflowDocumentCandidate({
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0.0",
      workflow: { id: "w", label: "W" },
      steps: [
        {
          type: "step",
          id: "echo",
          uses: "@executioncontrolprotocol/test.echo",
          inputs: { value: "hello" },
          as: "echo",
        },
      ],
    }) as Record<string, unknown>
    const step = (normalized.steps as Record<string, unknown>[])[0]
    expect(step.input).toEqual({ value: "hello" })
    expect(step.inputs).toBeUndefined()
  })

  it("adds type step when uses is present", () => {
    const normalized = normalizeWorkflowDocumentCandidate({
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0.0",
      workflow: { id: "w", label: "W" },
      steps: [{ id: "echo", uses: "@executioncontrolprotocol/test.echo", as: "echo" }],
    }) as Record<string, unknown>
    const step = (normalized.steps as Record<string, unknown>[])[0]
    expect(step.type).toBe("step")
  })
})
