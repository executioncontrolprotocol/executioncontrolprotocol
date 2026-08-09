import { describe, expect, it } from "vitest"
import { registerTestExtension, workflow, step, harness } from "@executioncontrolprotocol/core"
import {
  BrowserAuthoringService,
  createBrowserEnvironment,
  createEcp,
  registerBrowserHost,
} from "../src/index.js"
import {
  BROWSER_NANO_HARNESS_CAPABILITY,
  BROWSER_NANO_HARNESS_ID,
  HARNESS_NANO_BINDING,
  HARNESS_TASKS,
  registerBrowserNanoHarnesses,
} from "@executioncontrolprotocol/harnesses-browser-nano"
import { registerFormatToonExtension } from "@executioncontrolprotocol/format-toon"
import { registerFormatMermaidExtension } from "@executioncontrolprotocol/format-mermaid"
import { registerFormatEqlExtension } from "@executioncontrolprotocol/format-eql"
import "@executioncontrolprotocol/format-toon"
import "@executioncontrolprotocol/format-mermaid"
import "@executioncontrolprotocol/format-eql"
import type { HarnessInvokeResult, WorkflowManifest } from "@executioncontrolprotocol/types"

async function authoringEcp() {
  await registerBrowserHost()
  registerBrowserNanoHarnesses()
  await registerFormatToonExtension()
  await registerFormatMermaidExtension()
  await registerFormatEqlExtension()
  await registerTestExtension()
  const env = createBrowserEnvironment("authoring-test")
  env.addExtensionBinding("@executioncontrolprotocol/format-toon", {})
  env.addExtensionBinding("@executioncontrolprotocol/format-mermaid", {})
  env.addExtensionBinding("@executioncontrolprotocol/format-eql", {})
  env.addExtensionBinding("@executioncontrolprotocol/format-json", {})
  env.addExtensionBinding("@executioncontrolprotocol/test", {})
  env.withHarnesses([
    harness(BROWSER_NANO_HARNESS_ID)
      .uses("@executioncontrolprotocol/test.generate")
      .with({ ...HARNESS_NANO_BINDING }),
  ])
  return createEcp(env)
}

describe("BrowserAuthoringService", () => {
  it("creates workflow via workflow-authoring harness", async () => {
    const ecp = await authoringEcp()
    const invoked = await ecp
      .invoke(BROWSER_NANO_HARNESS_CAPABILITY)
      .uses("@executioncontrolprotocol/test.generate")
      .with({ task: HARNESS_TASKS.WORKFLOW_AUTHORING, request: "echo demo workflow" })
      .process()
    expect(invoked.success).toBe(true)
    const harnessResult = invoked.result as HarnessInvokeResult<WorkflowManifest>
    expect(harnessResult.artifact.schema).toBe("@executioncontrolprotocol.workflow")

    const service = new BrowserAuthoringService(ecp)
    const panels = await service.encodePanels(harnessResult.artifact)
    expect(panels.fluent).toContain("workflow")
    expect(panels.toon.length).toBeGreaterThan(0)
    expect(panels.mermaid).toContain("flowchart LR")
    expect(panels.mermaid).not.toContain("no steps")
    expect(panels.mermaid).toContain("Demo Echo")
    await ecp.terminate()
  })

  it("encodePanels derives mermaid from manifest only (not from toon)", async () => {
    const ecp = await authoringEcp()
    const service = new BrowserAuthoringService(ecp)
    const manifest = workflow("Graph test")
      .run([step("@executioncontrolprotocol/test.echo", "Echo step").with({ value: 1 }).as("echo")])
      .toManifest()
    const panels = await service.encodePanels(manifest)
    expect(panels.mermaid).toContain("Echo step")
    expect(panels.mermaid).not.toContain("no steps")
    expect(panels.mermaid).toMatch(/^flowchart LR/m)
    expect(panels.mermaid).toContain("subgraph graph_test [Graph test]")
    expect(panels.mermaid).toContain("direction LR")
    expect(panels.mermaid).toContain('s0["Echo step"]')
    expect(panels.mermaid).not.toContain("root[")
    expect(panels.mermaid).not.toContain("root -->")
    expect(panels.toon.length).toBeGreaterThan(0)
    expect(panels.json).toContain('"Echo step"')
    await ecp.terminate()
  })

  it("encodePanels includes patch TOON when provided", async () => {
    const ecp = await authoringEcp()
    const service = new BrowserAuthoringService(ecp)
    const manifest = workflow("Patch test")
      .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hello" }).as("echo")])
      .toManifest()
    const panels = await service.encodePanels(
      manifest,
      "steps[echo].input:\n  value: patched"
    )
    expect(panels.patch).toContain("steps[echo]")
    await ecp.terminate()
  })
})
