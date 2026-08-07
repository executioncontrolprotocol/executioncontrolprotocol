import { describe, expect, it } from "vitest"
import {
  hoistWorkflowStepsInRawJson,
  repairWorkflowJsonSyntax,
} from "@executioncontrolprotocol/core"

describe("hoistWorkflowStepsInRawJson", () => {
  it("hoists steps nested under workflow", () => {
    const raw = JSON.stringify({
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0.0",
      workflow: {
        id: "w",
        label: "W",
        steps: [{ type: "step", id: "echo", uses: "@executioncontrolprotocol/test.echo", as: "echo" }],
      },
    })
    const repaired = hoistWorkflowStepsInRawJson(raw)
    const parsed = JSON.parse(repaired) as {
      workflow: Record<string, unknown>
      steps: unknown[]
    }
    expect(parsed.steps).toHaveLength(1)
    expect(parsed.workflow.steps).toBeUndefined()
  })

  it("inserts missing as field before next step object", () => {
    const broken =
      '{"steps":[{"type":"step","id":"echo","uses":"@executioncontrolprotocol/test.echo","input":{"value":"hello"}},{"type":"step","id":"summarize","uses":"@executioncontrolprotocol/test.summarize","as":"summary"}]}'
    const repaired = repairWorkflowJsonSyntax(broken)
    expect(() => JSON.parse(repaired)).not.toThrow()
    const parsed = JSON.parse(repaired) as { steps: { as?: string }[] }
    expect(parsed.steps[0]?.as).toBe("echo")
  })

  it("fixes floating as field placed outside step object", () => {
    // Model outputs the "as" after the step's closing brace instead of inside it
    const broken =
      '{"schema":"@executioncontrolprotocol.workflow","version":"1.0.0","workflow":{"id":"test"},"steps":[{"type":"step","id":"echo","label":"Echo","uses":"@executioncontrolprotocol/test.echo","input":{"value":"hello"}},"as":"echo"},{"type":"step","id":"summarize","uses":"@executioncontrolprotocol/test.summarize","input":{"text":{"$ref":"state.echo.output"}},"as":"summary"}]}'
    const repaired = repairWorkflowJsonSyntax(broken)
    expect(() => JSON.parse(repaired)).not.toThrow()
    const parsed = JSON.parse(repaired) as { steps: { id: string; as?: string }[] }
    expect(parsed.steps[0]?.as).toBe("echo")
    expect(parsed.steps[1]?.as).toBe("summary")
  })

  it("does not corrupt valid JSON with $ref inputs", () => {
    const valid = JSON.stringify({
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0.0",
      workflow: { id: "test" },
      steps: [
        { type: "step", id: "echo", uses: "@executioncontrolprotocol/test.echo", input: { value: "hello" }, as: "echo" },
        { type: "step", id: "summarize", uses: "@executioncontrolprotocol/test.summarize", input: { text: { $ref: "state.echo.output" } }, as: "summary" },
      ],
    })
    const repaired = repairWorkflowJsonSyntax(valid)
    expect(JSON.parse(repaired)).toEqual(JSON.parse(valid))
  })
})
