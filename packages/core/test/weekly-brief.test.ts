import { describe, expect, it } from "vitest"
import { compileWorkflowSource } from "@executioncontrolprotocol/node"
import { extension } from "../src/index.js"
import { environment, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import { openaiExtension } from "@executioncontrolprotocol/extension-openai"

const WEEKLY_WORKFLOW = `
import { workflow, step, ref } from "@executioncontrolprotocol/core"
export default workflow("Weekly leadership brief")
  .accepts({
    type: "object",
    properties: { signals: { type: "array" } },
    required: ["signals"],
  })
  .run([
    step("@executioncontrolprotocol/openai.generate", "Generate Executive Brief")
      .with({ prompt: "Create a concise leadership brief.", context: ref("input.signals") })
      .as("brief"),
  ])
`

describe("examples/02-weekly-brief", () => {
  it("workflow compiles against registered extensions", async () => {
    const env = environment(NODE_ENVIRONMENT_ID, "weekly-brief").with([
      extension(openaiExtension, "OpenAI").with({ defaultModel: "gpt-4o-mini" }),
    ])

    const compiled = await compileWorkflowSource({
      source: WEEKLY_WORKFLOW,
      filename: "workflow.ts",
    })
    expect(compiled.ok).toBe(true)
    expect(compiled.manifest?.steps).toHaveLength(1)

    const ecp = await env.init()
    const desc = await ecp.describe()
    expect(desc.capabilities.some((c) => c.id === "@executioncontrolprotocol/openai.generate")).toBe(true)
  })

  it("rejects a compile when openai is not imported in source (still compiles source)", async () => {
    const compiled = await compileWorkflowSource({
      source: WEEKLY_WORKFLOW,
      filename: "workflow.ts",
    })
    expect(compiled.ok).toBe(true)
    expect(compiled.manifest?.workflow.accepts).toBeDefined()
  })

  it("compiled step uses input.signals rather than a memory capability", async () => {
    const compiled = await compileWorkflowSource({
      source: WEEKLY_WORKFLOW,
      filename: "workflow.ts",
    })
    expect(compiled.ok).toBe(true)
    const step = compiled.manifest?.steps[0] as { uses?: string; input?: { context?: unknown } }
    expect(step.uses).toBe("@executioncontrolprotocol/openai.generate")
    expect(JSON.stringify(step.input)).toContain("input.signals")
    expect(JSON.stringify(compiled.manifest)).not.toContain("memory.search")
  })
})
