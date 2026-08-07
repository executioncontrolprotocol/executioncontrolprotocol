import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createEcpMcpServer } from "../../src/index.js"
import { extension, workflow, step, registerTestExtension } from "@executioncontrolprotocol/core"
import { environment } from "@executioncontrolprotocol/node"
import type { Ecp } from "@executioncontrolprotocol/core"

type TextContent = { type: string; text: string }

/** Parse the first text content block of a tool/resource result as JSON. */
function parseText(content: TextContent[] | undefined): unknown {
  const text = content?.find((c) => c.type === "text")?.text
  if (text === undefined) throw new Error("no text content")
  return JSON.parse(text)
}

const echoWorkflow = workflow("Echo")
  .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hi" }).as("out")])
  .toManifest()

describe("@executioncontrolprotocol/mcp wire protocol (Client <-> Server)", () => {
  let ecp: Ecp
  let client: Client

  beforeEach(async () => {
    await registerTestExtension()
    const env = (await environment("mcp-wire")).withExtensions([
      extension("@executioncontrolprotocol/test", "Test").with({}),
    ])
    ecp = await env.init()

    const server = createEcpMcpServer({ ecp })
    client = new Client({ name: "test-client", version: "1.0.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ])
  })

  afterEach(async () => {
    await client.close()
    await ecp.terminate()
  })

  it("lists the operational tools", async () => {
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        "ecp.describe_environment",
        "ecp.search",
        "ecp.validate_workflow",
        "ecp.run_workflow",
        "ecp.encode",
        "ecp.decode",
        "ecp.get_run_status",
      ])
    )
  })

  it("describes the environment over the wire", async () => {
    const res = await client.callTool({ name: "ecp.describe_environment", arguments: {} })
    const descriptor = parseText(res.content as TextContent[]) as {
      schema: string
      capabilities: { id: string }[]
    }
    expect(descriptor.schema).toBe("@executioncontrolprotocol.environment.describe")
    expect(descriptor.capabilities.some((c) => c.id.includes("echo"))).toBe(true)
  })

  it("validates a workflow over the wire", async () => {
    const res = await client.callTool({
      name: "ecp.validate_workflow",
      arguments: { workflow: echoWorkflow as unknown as Record<string, unknown> },
    })
    const validation = parseText(res.content as TextContent[]) as { valid: boolean }
    expect(validation.valid).toBe(true)
  })

  it("reports validation failure for an unknown capability", async () => {
    const broken = workflow("Broken")
      .run([step("@executioncontrolprotocol/test.does-not-exist", "X").with({}).as("o")])
      .toManifest()
    const res = await client.callTool({
      name: "ecp.validate_workflow",
      arguments: { workflow: broken as unknown as Record<string, unknown> },
    })
    const validation = parseText(res.content as TextContent[]) as { valid: boolean }
    expect(validation.valid).toBe(false)
  })

  it("runs a workflow and retrieves its status", async () => {
    const runRes = await client.callTool({
      name: "ecp.run_workflow",
      arguments: { workflow: echoWorkflow as unknown as Record<string, unknown> },
    })
    const result = parseText(runRes.content as TextContent[]) as {
      run: { id: string; status: string }
    }
    expect(result.run.status).toBe("completed")

    const statusRes = await client.callTool({
      name: "ecp.get_run_status",
      arguments: { runId: result.run.id },
    })
    const status = parseText(statusRes.content as TextContent[]) as {
      run: { id: string }
    }
    expect(status.run.id).toBe(result.run.id)
  })

  it("returns a serialized error for an unknown tool", async () => {
    const res = await client.callTool({ name: "ecp.not_a_tool", arguments: {} })
    expect(res.isError).toBe(true)
    const text = (res.content as TextContent[])
      .map((c) => c.text)
      .join("\n")
    expect(text).toContain("not found")
  })

  it("lists and reads the capabilities resource", async () => {
    const { resources } = await client.listResources()
    expect(resources.some((r) => r.uri === "ecp://capabilities")).toBe(true)

    const read = await client.readResource({ uri: "ecp://capabilities" })
    const capabilities = JSON.parse(read.contents[0]!.text as string) as { id: string }[]
    expect(capabilities.some((c) => c.id.includes("echo"))).toBe(true)
  })

  it("reads a single capability via the templated resource", async () => {
    const read = await client.readResource({ uri: "ecp://capabilities/@executioncontrolprotocol/test.echo" })
    const capability = JSON.parse(read.contents[0]!.text as string) as { id: string }
    expect(capability.id).toBe("@executioncontrolprotocol/test.echo")
  })

  it("lists prompts and renders author_workflow", async () => {
    const { prompts } = await client.listPrompts()
    expect(prompts.map((p) => p.name)).toEqual(
      expect.arrayContaining([
        "ecp.author_workflow",
        "ecp.repair_workflow",
        "ecp.explain_environment",
      ])
    )

    const prompt = await client.getPrompt({
      name: "ecp.author_workflow",
      arguments: { goal: "echo a value" },
    })
    const text = prompt.messages
      .map((m) => (m.content.type === "text" ? m.content.text : ""))
      .join("\n")
    expect(text).toContain("echo a value")
    expect(text).toContain("@executioncontrolprotocol/test.echo")
  })
})
