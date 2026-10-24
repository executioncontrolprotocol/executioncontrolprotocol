import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"
import { extension } from "@executioncontrolprotocol/core"
import jsonataExtension from "@executioncontrolprotocol/plugin-jsonata"
import { createEcpMcpServer } from "../src/server.js"
import { ECHO_SOURCE, parseEnvelope, testHost } from "./host.js"
import type { Ecp } from "@executioncontrolprotocol/core"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

type TextContent = { type: string; text: string }

describe("MCP live updates", () => {
  let ecp: Ecp | undefined
  let client: Client | undefined
  let server: McpServer | undefined
  const previousRunsDir = process.env.ECP_RUNS_DIR

  afterEach(async () => {
    await client?.close()
    client = undefined
    await server?.close()
    server = undefined
    await ecp?.terminate()
    ecp = undefined
    if (previousRunsDir === undefined) delete process.env.ECP_RUNS_DIR
    else process.env.ECP_RUNS_DIR = previousRunsDir
  })

  it("rebuilds capability tools and notifies list_changed when the plugin manifest changes", async () => {
    process.env.ECP_RUNS_DIR = await mkdtemp(join(tmpdir(), "ecp-mcp-live-runs-"))
    const dataDir = await mkdtemp(join(tmpdir(), "ecp-mcp-live-data-"))
    await writeFile(join(dataDir, "package.json"), "{}\n", "utf8")
    const initial = await testHost()
    ecp = initial.ecp
    let notifications = 0
    server = createEcpMcpServer({
      host: initial.host,
      watchDataDir: dataDir,
      rebuildHost: async () => {
        const next = await testHost([extension(jsonataExtension)])
        await ecp?.terminate()
        ecp = next.ecp
        return next.host
      },
    })
    client = new Client({ name: "live-client", version: "1.0.0" })
    client.fallbackNotificationHandler = async (notification) => {
      if (notification.method === "notifications/tools/list_changed") notifications += 1
    }
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

    const before = (await client.listTools()).tools.map((t) => t.name)
    expect(before).not.toContain("jsonata_transform")

    await writeFile(join(dataDir, "package.json"), JSON.stringify({ name: "updated" }), "utf8")
    await vi.waitFor(() => {
      expect(notifications).toBeGreaterThan(0)
    }, { timeout: 5_000 })
    const after = (await client.listTools()).tools.map((t) => t.name)
    expect(after).toContain("jsonata_transform")
  })

  it("maps ecp_run events to MCP progress notifications", async () => {
    process.env.ECP_RUNS_DIR = await mkdtemp(join(tmpdir(), "ecp-mcp-progress-runs-"))
    const ctx = await testHost()
    ecp = ctx.ecp
    server = createEcpMcpServer({ host: ctx.host })
    client = new Client({ name: "progress-client", version: "1.0.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

    const progress: { message?: string }[] = []
    const res = await client.callTool(
      { name: "ecp_run", arguments: { source: ECHO_SOURCE, events: true } },
      CallToolResultSchema,
      { onprogress: (event) => progress.push(event) }
    )
    const envelope = parseEnvelope(res.content as TextContent[])
    expect(envelope.ok).toBe(true)
    expect(progress.some((p) => p.message === "run.start")).toBe(true)
    expect(progress.some((p) => p.message === "run.end")).toBe(true)
  })

  it("does not emit progress when events is omitted", async () => {
    process.env.ECP_RUNS_DIR = await mkdtemp(join(tmpdir(), "ecp-mcp-noprogress-runs-"))
    const ctx = await testHost()
    ecp = ctx.ecp
    server = createEcpMcpServer({ host: ctx.host })
    client = new Client({ name: "noprogress-client", version: "1.0.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

    const progress: unknown[] = []
    await client.callTool(
      { name: "ecp_run", arguments: { source: ECHO_SOURCE } },
      CallToolResultSchema,
      { onprogress: (event) => progress.push(event) }
    )
    expect(progress).toEqual([])
  })
})
