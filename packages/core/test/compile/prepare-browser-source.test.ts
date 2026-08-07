import { describe, expect, it } from "vitest"
import { prepareBrowserWorkflowSource } from "../../src/compile/prepare-browser-source.js"

describe("prepareBrowserWorkflowSource", () => {
  it("strips @executioncontrolprotocol/browser import and injects global shim", () => {
    const source = `import { workflow, step } from "@executioncontrolprotocol/browser";
export default workflow("W").run([step("@executioncontrolprotocol/test.echo", "E").with({ value: 1 }).as("o")]);`
    const prepared = prepareBrowserWorkflowSource(source)
    expect(prepared).toContain("globalThis.__ecpWorkflowShim")
    expect(prepared).not.toContain("@executioncontrolprotocol/browser")
  })
})
