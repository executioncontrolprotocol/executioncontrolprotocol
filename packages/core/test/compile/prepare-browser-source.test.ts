import { describe, expect, it } from "vitest"
import { prepareBrowserWorkflowSource } from "../../src/compile/prepare-browser-source.js"

describe("prepareBrowserWorkflowSource", () => {
  it("strips @executioncontrolprotocol/browser import and injects global shim", () => {
    const source = `import { workflow, step } from "@executioncontrolprotocol/browser";
export default workflow("W").run([step("@executioncontrolprotocol/test.echo", "E").with({ value: 1 }).as("o")]);`
    const prepared = prepareBrowserWorkflowSource(source)
    expect(prepared).toContain("globalThis.__ecpWorkflowShim")
    expect(prepared).not.toContain("@executioncontrolprotocol/browser")
    expect(prepared).toContain("workflow, step")
  })

  it("strips @executioncontrolprotocol/core import including ref", () => {
    const source = `import { workflow, step, ref } from "@executioncontrolprotocol/core"

export default workflow("Email Summarizer")
  .run([
    step("@executioncontrolprotocol/test.echo", "Get Email").as("emailText"),
    step("@executioncontrolprotocol/test.echo", "Summarize")
      .with({ prompt: ref("emailText.output") })
      .as("summary"),
  ])
`
    const prepared = prepareBrowserWorkflowSource(source)
    expect(prepared).toContain("globalThis.__ecpWorkflowShim")
    expect(prepared).toMatch(/const \{[^}]*ref[^}]*\} = globalThis\.__ecpWorkflowShim/)
    expect(prepared).not.toContain('from "@executioncontrolprotocol/core"')
  })

  it("strips multiline named imports", () => {
    const source = `import {
  workflow,
  step,
  ref
} from "@executioncontrolprotocol/core"
export default workflow("W").run([])`
    const prepared = prepareBrowserWorkflowSource(source)
    expect(prepared).not.toContain("@executioncontrolprotocol/core")
    expect(prepared).toContain("globalThis.__ecpWorkflowShim")
    expect(prepared).toContain('workflow("W")')
  })
})
