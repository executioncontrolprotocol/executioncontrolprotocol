import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { extension } from "@executioncontrolprotocol/core"
import jsonataExtension from "@executioncontrolprotocol/plugin-jsonata"
import {
  ECP_PLUGIN_DENIED,
  ECP_PLUGINS_MISSING,
} from "@executioncontrolprotocol/core/types"
import { createEcpMcpServer } from "../src/server.js"
import { META_TOOL_NAMES } from "../src/constants.js"
import { ECHO_SOURCE, parseEnvelope, parseText, testHost } from "./host.js"
import type { Ecp } from "@executioncontrolprotocol/core"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

type TextContent = { type: string; text: string }

describe("createEcpMcpServer", () => {
  let ecp: Ecp
  let client: Client
  let server: McpServer
  const previousRunsDir = process.env.ECP_RUNS_DIR

  beforeEach(async () => {
    process.env.ECP_RUNS_DIR = await mkdtemp(join(tmpdir(), "ecp-mcp-runs-"))
    const ctx = await testHost([
      extension(jsonataExtension),
    ])
    ecp = ctx.ecp
    server = createEcpMcpServer({
      host: ctx.host,
      installPlugin: async (spec) => ({ installed: spec }),
    })
    client = new Client({ name: "test-client", version: "1.0.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  })

  afterEach(async () => {
    await client.close()
    await ecp.terminate()
    if (previousRunsDir === undefined) delete process.env.ECP_RUNS_DIR
    else process.env.ECP_RUNS_DIR = previousRunsDir
  })

  it("lists meta tools plus jsonata_transform and omits encode/decode", async () => {
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining([...META_TOOL_NAMES, "jsonata_transform"]))
    expect(names).not.toEqual(expect.arrayContaining(["ecp.encode", "ecp.decode", "ecp.get_run_status"]))
    expect(names.some((n) => n.includes("."))).toBe(false)
  })

  it("describes the environment", async () => {
    const res = await client.callTool({ name: "ecp_describe", arguments: {} })
    const envelope = parseEnvelope(res.content as TextContent[])
    expect(envelope.ok).toBe(true)
    const descriptor = envelope.data as { schema: string; capabilities: { id: string }[] }
    expect(descriptor.schema).toBe("@executioncontrolprotocol.environment.describe")
    expect(descriptor.capabilities.some((c) => c.id.includes("jsonata"))).toBe(true)
  })

  it("searches capabilities", async () => {
    const res = await client.callTool({ name: "ecp_search", arguments: { query: "jsonata" } })
    const envelope = parseEnvelope(res.content as TextContent[])
    expect(envelope.ok).toBe(true)
    const result = envelope.data as { results: { id: string }[] }
    expect(result.results.some((r) => r.id.includes("jsonata"))).toBe(true)
  })

  it("validates inlined source", async () => {
    const res = await client.callTool({
      name: "ecp_validate",
      arguments: { source: ECHO_SOURCE },
    })
    const envelope = parseEnvelope(res.content as TextContent[])
    expect(envelope.ok).toBe(true)
    expect((envelope.data as { valid: boolean }).valid).toBe(true)
  })

  it("reports validation failure for an unknown capability", async () => {
    const source = `import { workflow, step } from "@executioncontrolprotocol/core"
export default workflow("Broken").run([
  step("@executioncontrolprotocol/test.does-not-exist", "X").with({}).as("o"),
])
`
    const res = await client.callTool({ name: "ecp_validate", arguments: { source } })
    const envelope = parseEnvelope(res.content as TextContent[])
    expect(envelope.ok).toBe(true)
    expect((envelope.data as { valid: boolean }).valid).toBe(false)
  })

  it("runs inlined source and shows the journal", async () => {
    const runRes = await client.callTool({
      name: "ecp_run",
      arguments: { source: ECHO_SOURCE },
    })
    const runEnvelope = parseEnvelope(runRes.content as TextContent[])
    expect(runEnvelope.ok).toBe(true)
    const data = runEnvelope.data as { runId: string; run: { status: string } }
    expect(data.run.status).toBe("completed")
    expect(data.runId).toBeTruthy()

    const show = await client.callTool({
      name: "ecp_runs_show",
      arguments: { runId: data.runId },
    })
    const showEnvelope = parseEnvelope(show.content as TextContent[])
    expect(showEnvelope.ok).toBe(true)
    expect((showEnvelope.data as { runId: string }).runId).toBe(data.runId)

    const stepShow = await client.callTool({
      name: "ecp_runs_show",
      arguments: { runId: data.runId, step: "echo" },
    })
    expect(parseEnvelope(stepShow.content as TextContent[]).ok).toBe(true)

    const runResource = await client.readResource({ uri: `ecp://runs/${data.runId}` })
    const journal = JSON.parse(runResource.contents[0]!.text as string) as { runId: string }
    expect(journal.runId).toBe(data.runId)
  })

  it("reruns from a journaled step", async () => {
    const runRes = await client.callTool({
      name: "ecp_run",
      arguments: { source: ECHO_SOURCE },
    })
    const runId = (parseEnvelope(runRes.content as TextContent[]).data as { runId: string }).runId
    const rerun = await client.callTool({
      name: "ecp_runs_rerun",
      arguments: { runId, from: "echo" },
    })
    const envelope = parseEnvelope(rerun.content as TextContent[])
    expect(envelope.ok).toBe(true)
    expect((envelope.data as { run: { status: string } }).run.status).toBe("completed")
  })

  it("returns an error for an unknown run id", async () => {
    const res = await client.callTool({
      name: "ecp_runs_show",
      arguments: { runId: "missing-run" },
    })
    expect(res.isError).toBe(true)
    const envelope = parseEnvelope(res.content as TextContent[])
    expect(envelope.error?.code).toBe("ECP_INPUT_INVALID")
  })

  it("rejects path and source together", async () => {
    const res = await client.callTool({
      name: "ecp_validate",
      arguments: { path: "a.ecp.ts", source: ECHO_SOURCE },
    })
    expect(res.isError).toBe(true)
    const envelope = parseEnvelope(res.content as TextContent[])
    expect(envelope.error?.code).toBe("ECP_INPUT_INVALID")
  })

  it("returns ECP_PLUGINS_MISSING when describe format is not installed", async () => {
    const res = await client.callTool({
      name: "ecp_describe",
      arguments: { format: "toon" },
    })
    expect(res.isError).toBe(true)
    const envelope = parseEnvelope(res.content as TextContent[])
    expect(envelope.error?.code).toBe(ECP_PLUGINS_MISSING)
  })

  it("describes one capability by id", async () => {
    const res = await client.callTool({
      name: "ecp_describe",
      arguments: { capability: "@executioncontrolprotocol/jsonata.transform" },
    })
    const envelope = parseEnvelope(res.content as TextContent[])
    expect(envelope.ok).toBe(true)
    const descriptor = envelope.data as { capabilities: { id: string }[] }
    expect(descriptor.capabilities.map((c) => c.id)).toEqual([
      "@executioncontrolprotocol/jsonata.transform",
    ])
  })

  it("returns an invoke error for an unknown capability", async () => {
    const res = await client.callTool({
      name: "ecp_invoke",
      arguments: { capabilityId: "@executioncontrolprotocol/missing.nope" },
    })
    expect(res.isError).toBe(true)
    const envelope = parseEnvelope(res.content as TextContent[])
    expect(envelope.ok).toBe(false)
    expect(envelope.error?.code).toBeTruthy()
  })

  it("invokes jsonata_transform as a capability tool", async () => {
    const res = await client.callTool({
      name: "jsonata_transform",
      arguments: { expression: "a", payload: { a: 1 } },
    })
    const envelope = parseEnvelope(res.content as TextContent[])
    expect(envelope.ok).toBe(true)
    expect(envelope.data).toEqual({ result: 1 })
  })

  it("returns an error when jsonata_transform input fails the schema", async () => {
    const res = await client.callTool({
      name: "jsonata_transform",
      arguments: { expression: "", payload: {} },
    })
    expect(res.isError).toBe(true)
  })

  it("rejects plugin install without confirm", async () => {
    const res = await client.callTool({
      name: "ecp_plugins_install",
      arguments: { package: "acme-plugin", confirm: false },
    })
    expect(res.isError).toBe(true)
    const envelope = parseEnvelope(res.content as TextContent[])
    expect(envelope.ok).toBe(false)
    expect(envelope.error?.code).toBe(ECP_PLUGIN_DENIED)
  })

  it("installs a plugin when confirm is true", async () => {
    const res = await client.callTool({
      name: "ecp_plugins_install",
      arguments: { package: "@executioncontrolprotocol/plugin-jsonata", confirm: true },
    })
    const envelope = parseEnvelope(res.content as TextContent[])
    expect(envelope.ok).toBe(true)
    expect(envelope.data).toEqual({ installed: "@executioncontrolprotocol/plugin-jsonata" })
  })

  it("returns a serialized error for an unknown tool", async () => {
    const res = await client.callTool({ name: "ecp_not_a_tool", arguments: {} })
    expect(res.isError).toBe(true)
    const text = (res.content as TextContent[]).map((c) => c.text).join("\n")
    expect(text.toLowerCase()).toMatch(/not found/)
  })

  it("lists and reads the capabilities resource", async () => {
    const { resources } = await client.listResources()
    expect(resources.some((r) => r.uri === "ecp://capabilities")).toBe(true)
    expect(resources.some((r) => r.uri === "ecp://environment")).toBe(true)
    expect(resources.some((r) => r.uri === "ecp://policies")).toBe(true)
    const read = await client.readResource({ uri: "ecp://capabilities" })
    const capabilities = JSON.parse(read.contents[0]!.text as string) as { id: string }[]
    expect(capabilities.some((c) => c.id.includes("jsonata"))).toBe(true)
  })

  it("reads a capability via the templated resource", async () => {
    const read = await client.readResource({
      uri: "ecp://capability/@executioncontrolprotocol/jsonata.transform",
    })
    const capability = JSON.parse(read.contents[0]!.text as string) as { id: string }
    expect(capability.id).toBe("@executioncontrolprotocol/jsonata.transform")
  })
})

describe("createEcpMcpServer tools=meta", () => {
  it("omits capability tools", async () => {
    const { ecp, host } = await testHost([extension(jsonataExtension)])
    const server = createEcpMcpServer({ host, tools: "meta" })
    const client = new Client({ name: "meta-client", version: "1.0.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    try {
      const { tools } = await client.listTools()
      const names = tools.map((t) => t.name)
      expect(names).toEqual(expect.arrayContaining([...META_TOOL_NAMES]))
      expect(names).not.toContain("jsonata_transform")
    } finally {
      await client.close()
      await ecp.terminate()
    }
  })

  it("still reaches jsonata through ecp_invoke", async () => {
    const { ecp, host } = await testHost([extension(jsonataExtension)])
    const server = createEcpMcpServer({ host, tools: "meta" })
    const client = new Client({ name: "meta-invoke", version: "1.0.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    try {
      const res = await client.callTool({
        name: "ecp_invoke",
        arguments: {
          capabilityId: "@executioncontrolprotocol/jsonata.transform",
          input: { expression: "a", payload: { a: 2 } },
        },
      })
      const envelope = parseEnvelope(res.content as TextContent[])
      expect(envelope.ok).toBe(true)
      expect((envelope.data as { success: boolean; result: unknown }).success).toBe(true)
      expect((envelope.data as { result: unknown }).result).toEqual({ result: 2 })
    } finally {
      await client.close()
      await ecp.terminate()
    }
  })
})

describe("ecp_plugins_install without installer", () => {
  it("returns ECP_PLUGINS_MISSING when no CLI config is present", async () => {
    const { ecp, host } = await testHost()
    const server = createEcpMcpServer({ host })
    const client = new Client({ name: "no-install", version: "1.0.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    try {
      const res = await client.callTool({
        name: "ecp_plugins_install",
        arguments: { package: "acme-plugin", confirm: true },
      })
      expect(res.isError).toBe(true)
      const envelope = parseEnvelope(res.content as TextContent[])
      expect(envelope.error?.code).toBe(ECP_PLUGINS_MISSING)
    } finally {
      await client.close()
      await ecp.terminate()
    }
  })
})

describe("parseText helper", () => {
  it("throws when content has no text", () => {
    expect(() => parseText([])).toThrow(/no text content/)
  })
})
