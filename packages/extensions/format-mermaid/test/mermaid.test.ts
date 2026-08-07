import { describe, expect, it } from "vitest"
import { workflow, step, parallel, branch, loop } from "@executioncontrolprotocol/core"
import { initEncodingTestEcp } from "../../../core/test/helpers.js"
import { extension } from "@executioncontrolprotocol/core"
import { workflowToMermaid } from "../src/workflow-to-mermaid.js"
import { registerFormatMermaidExtension } from "../src/index.js"

describe("@executioncontrolprotocol/format-mermaid", () => {
  it("encodes workflow to mermaid flowchart with workflow subgraph", async () => {
    await registerFormatMermaidExtension()
    const ecp = await initEncodingTestEcp([extension("@executioncontrolprotocol/format-mermaid").with({})])
    const manifest = workflow("Demo")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "x" }).as("echo")])
      .toManifest()
    const encoded = await ecp.encode(manifest).uses("@executioncontrolprotocol/format-mermaid").process()
    expect(encoded.success).toBe(true)
    const source = String(encoded.result)
    expect(source).toContain("flowchart TD")
    expect(source).toContain("direction TD")
    expect(source).toContain("Echo")
    expect(source).toContain("subgraph")
    expect(source).not.toContain("root[")
    expect(source).not.toContain("root -->")
    await ecp.terminate()
  })

  it("supports flowchart direction via encode with()", async () => {
    await registerFormatMermaidExtension()
    const ecp = await initEncodingTestEcp([extension("@executioncontrolprotocol/format-mermaid").with({})])
    const manifest = workflow("Demo")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "x" }).as("echo")])
      .toManifest()
    const encoded = await ecp
      .encode(manifest)
      .uses("@executioncontrolprotocol/format-mermaid")
      .with({ direction: "LR" })
      .process()
    expect(encoded.success).toBe(true)
    const source = String(encoded.result)
    expect(source).toMatch(/^flowchart LR/m)
    expect(source).toMatch(/subgraph \w+ \[Demo\][\s\S]*direction LR/)
    await ecp.terminate()
  })

  it("renders steps without explicit type field (compact TOON decode)", () => {
    const source = workflowToMermaid({
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "demo-generated" },
      steps: [{ id: "echo", uses: "@executioncontrolprotocol/test.echo", label: "Demo Echo", as: "echo" }],
    })
    expect(source).toContain("Demo Echo")
    expect(source).toContain("subgraph demo_generated")
    expect(source).not.toContain('no steps')
    expect(source).not.toContain("root[")
  })

  it("renders sequential steps with edges inside workflow subgraph", () => {
    const manifest = workflow("Seq")
      .run([
        step("@executioncontrolprotocol/test.echo", "First").with({ value: "a" }).as("first"),
        step("@executioncontrolprotocol/test.echo", "Second").with({ value: "b" }).as("second"),
      ])
      .toManifest()
    const source = workflowToMermaid(manifest)
    expect(source).toContain('s0["First"]')
    expect(source).toContain('s1["Second"]')
    expect(source).toContain("s0 --> s1")
    expect(source).toMatch(/subgraph \w+ \[Seq\]/)
  })

  it("renders parallel as nested subgraphs, not a step box", () => {
    const manifest = workflow("Parallel")
      .run([
        step("@executioncontrolprotocol/test.echo", "Fetch").with({ value: "x" }).as("fetch"),
        parallel([
          [step("@executioncontrolprotocol/test.echo", "A").with({ value: "a" }).as("a")],
          [step("@executioncontrolprotocol/test.echo", "B").with({ value: "b" }).as("b")],
        ], { id: "parallel-1", label: "Run parallel" }),
        step("@executioncontrolprotocol/test.echo", "Done").with({ value: "d" }).as("done"),
      ])
      .toManifest()
    const source = workflowToMermaid(manifest)
    expect(source).toContain("subgraph")
    expect(source).not.toContain('["parallel"]')
    expect(source).not.toContain('["Run parallel"]')
    expect(source).toContain('s0["Fetch"]')
    expect(source).toContain('s2["Done"]')
    expect(source).toMatch(/s0 --> s1_0_0/)
    expect(source).toMatch(/s0 --> s1_1_0/)
  })

  it("renders branch as nested subgraphs", () => {
    const manifest = workflow("Branch")
      .run([
        branch([step("@executioncontrolprotocol/test.echo", "Yes").with({ value: "y" }).as("yes")], {
          id: "branch-1",
          label: "Choose",
        }),
      ])
      .toManifest()
    const source = workflowToMermaid(manifest)
    expect(source).toContain("subgraph")
    expect(source).not.toContain('["branch"]')
    expect(source).toContain('s0_0_0["Yes"]')
  })

  it("renders loop as nested subgraph wrapping inner steps", () => {
    const manifest = workflow("Loop")
      .run([
        loop({ id: "loop-1", label: "Retry loop" }, [
          step("@executioncontrolprotocol/test.echo", "Try").with({ value: "t" }).as("try"),
        ]),
      ])
      .toManifest()
    const source = workflowToMermaid(manifest)
    expect(source).toContain("subgraph")
    expect(source).not.toContain('["loop"]')
    expect(source).toContain('s0_0["Try"]')
  })

  it("renders empty workflow inside subgraph", () => {
    const source = workflowToMermaid({
      schema: "@executioncontrolprotocol.workflow",
      version: "1.0",
      workflow: { id: "empty-wf", label: "Empty" },
      steps: [],
    })
    expect(source).toContain("subgraph empty_wf [Empty]")
    expect(source).toContain('empty["no steps"]')
    expect(source).not.toContain("root[")
  })
})
