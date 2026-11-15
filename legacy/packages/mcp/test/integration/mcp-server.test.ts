import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { extension } from "@executioncontrolprotocol/core"
import jsonataExtension from "@executioncontrolprotocol/plugin-jsonata"
import { createEcpMcpServer } from "../../src/index.js"
import { META_TOOL_NAMES } from "../../src/constants.js"
import { ECHO_SOURCE, parseEnvelope, testHost } from "../host.js"
import type { Ecp } from "@executioncontrolprotocol/core"

type TextContent = { type: string; text: string }

describe("@executioncontrolprotocol/mcp wire protocol (Client <-> Server)", () => {
  let ecp: Ecp
  let client: Client

  beforeEach(async () => {
    const ctx = await testHost([extension(jsonataExtension)])
    ecp = ctx.ecp
    const server = createEcpMcpServer({ host: ctx.host })
    client = new Client({ name: "test-client", version: "1.0.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  })

  afterEach(async () => {
    await client.close()
    await ecp.terminate()
  })

  it("lists meta tools and jsonata_transform", async () => {
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining([...META_TOOL_NAMES, "jsonata_transform"]))
  })

  it("calls jsonata_transform", async () => {
    const res = await client.callTool({
      name: "jsonata_transform",
      arguments: { expression: "b", payload: { b: "ok" } },
    })
    const envelope = parseEnvelope(res.content as TextContent[])
    expect(envelope.ok).toBe(true)
    expect(envelope.data).toEqual({ result: "ok" })
  })

  it("runs a workflow from source", async () => {
    const res = await client.callTool({
      name: "ecp_run",
      arguments: { source: ECHO_SOURCE },
    })
    const envelope = parseEnvelope(res.content as TextContent[])
    expect(envelope.ok).toBe(true)
    expect((envelope.data as { run: { status: string }; runId: string }).run.status).toBe(
      "completed"
    )
    expect((envelope.data as { runId: string }).runId).toBeTruthy()
  })
})
