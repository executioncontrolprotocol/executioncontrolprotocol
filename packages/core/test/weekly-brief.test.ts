import { describe, expect, it } from "vitest"
import { compileWorkflowSource } from "../src/compile/index.js"
import { extension } from "../src/index.js"
import { environment } from "@executioncontrolprotocol/node"
import { registerMemoryExtension } from "@executioncontrolprotocol/extension-memory"
import { registerOpenaiExtension } from "@executioncontrolprotocol/extension-openai"
import { registerSlackExtension } from "@executioncontrolprotocol/extension-slack"

const WEEKLY_WORKFLOW = `
import { workflow, step, ref } from "@executioncontrolprotocol/core"
export default workflow("Weekly leadership brief")
  .run([
    step("@executioncontrolprotocol/memory.search", "Collect Weekly Signals")
      .with({ query: "important risks and decisions this week", since: "7d" })
      .as("signals"),
    step("@executioncontrolprotocol/openai.generate", "Generate Executive Brief")
      .with({ prompt: "Create a concise leadership brief.", context: ref("signals.results") })
      .as("brief"),
    step("@executioncontrolprotocol/slack.send", "Send Brief to Slack")
      .with({ message: ref("brief.content") }),
  ])
`

describe("examples/02-weekly-brief", () => {
  it("workflow compiles against registered extensions", async () => {
    await registerMemoryExtension()
    await registerOpenaiExtension()
    await registerSlackExtension()

    const env = (await environment("weekly-brief", "Weekly brief")).withExtensions([
        extension("@executioncontrolprotocol/memory", "Memory").with({ hydrateModels: true, collections: ["leadership"] }),
        extension("@executioncontrolprotocol/openai", "OpenAI").with({ defaultModel: "gpt-4o-mini" }),
        extension("@executioncontrolprotocol/slack", "Slack").with({}),
      ])

    const compiled = await compileWorkflowSource({
      source: WEEKLY_WORKFLOW,
      filename: "workflow.ts",
    })
    expect(compiled.ok).toBe(true)
    expect(compiled.manifest?.steps).toHaveLength(3)

    const ecp = await env.init()
    const desc = await ecp.describe()
    expect(desc.capabilities.some((c) => c.id === "@executioncontrolprotocol/memory.search")).toBe(true)
    expect(desc.capabilities.some((c) => c.id === "@executioncontrolprotocol/openai.generate")).toBe(true)
  })
})
