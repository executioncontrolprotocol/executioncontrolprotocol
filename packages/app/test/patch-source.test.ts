import { describe, expect, it } from "vitest"
import { workflow, step } from "@executioncontrolprotocol/core"
import { renderPatchedStepInput } from "../src/graph/patch-source.js"

describe("renderPatchedStepInput", () => {
  it("rewrites a step input into encoder Fluent source", () => {
    const manifest = workflow("Echo")
      .run([
        step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hi" }).as("out"),
      ])
      .toManifest()
    const source = renderPatchedStepInput(manifest, "echo", { value: "from-graph" })
    expect(source).toContain("from-graph")
    expect(source).toContain("@executioncontrolprotocol/core")
    expect(source).not.toContain("hi")
  })

  it("throws when the step id is missing", () => {
    const manifest = workflow("Echo")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hi" }).as("out")])
      .toManifest()
    expect(() => renderPatchedStepInput(manifest, "missing", { value: "x" })).toThrow()
  })
})
