import { describe, expect, it } from "vitest"
import { workflow, step, ref, parallel } from "../src/index.js"
import { validateWorkflow } from "../src/validate/workflow.js"

describe("workflow builder", () => {
  it("produces valid workflow manifest", () => {
    const manifest = workflow("Test")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hi" }).as("echo")])
      .toManifest()

    expect(manifest.schema).toBe("@executioncontrolprotocol.workflow")
    expect(manifest.version).toBe("1.0")
    expect(manifest.steps[0]).toMatchObject({
      uses: "@executioncontrolprotocol/test.echo",
      as: "echo",
    })
  })

  it("serializes ref helper", () => {
    const manifest = workflow("Refs")
      .run([
        step("@executioncontrolprotocol/test.echo", "A").with({ value: "x" }).as("a"),
        step("@executioncontrolprotocol/test.echo", "B").with({ value: ref("a.echo") }),
      ])
      .toManifest()

    const second = manifest.steps[1] as { input?: { value: { $ref: string } } }
    expect(second.input?.value.$ref).toBe("state.a.echo")
  })

  it("validates structure via zod", () => {
    const manifest = workflow("Ok").run([]).toManifest()
    const result = validateWorkflow(manifest)
    expect(result.valid).toBe(true)
  })

  it("supports parallel nodes", () => {
    const manifest = workflow("P")
      .run([
        parallel([
          [step("@executioncontrolprotocol/test.echo", "A").with({}).as("a")],
          [step("@executioncontrolprotocol/test.echo", "B").with({}).as("b")],
        ]),
      ])
      .toManifest()
    expect(manifest.steps[0]?.type).toBe("parallel")
  })
})
