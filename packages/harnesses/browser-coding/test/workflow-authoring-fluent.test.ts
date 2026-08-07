import { describe, expect, it } from "vitest"
import { compileWorkflowSource } from "@executioncontrolprotocol/core/compile"
import { renderWorkflowToFluent } from "@executioncontrolprotocol/core"
import { registerTestExtension } from "../../../core/src/testing/test-extension.js"

const SAMPLE = `
import { workflow, step } from "@executioncontrolprotocol/core"
export default workflow("Patch target")
  .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hi" }).as("echo")])
`

describe("Browser Coding workflow Fluent compile", () => {
  it("compiles model-style Fluent output", async () => {
    await registerTestExtension()
    const result = await compileWorkflowSource({ source: SAMPLE, filename: "workflow.ts" })
    expect(result.ok).toBe(true)
    expect(result.manifest?.steps[0]?.as).toBe("echo")
  })

  it("renders baseline Fluent for patch prompts", async () => {
    await registerTestExtension()
    const compiled = await compileWorkflowSource({ source: SAMPLE, filename: "workflow.ts" })
    expect(compiled.manifest).toBeDefined()
    const fluent = renderWorkflowToFluent(compiled.manifest!)
    expect(fluent).toContain("export default workflow")
    expect(fluent).toContain("@executioncontrolprotocol/test.echo")
  })
})
