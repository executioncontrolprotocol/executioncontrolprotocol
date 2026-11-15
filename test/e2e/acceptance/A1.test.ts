import { afterEach, describe, expect, it } from "vitest"
import {
  assertCliBuilt,
  callTool,
  createCliHome,
  openMcpSession,
  parseJsonStdout,
  pluginTestRoot,
  runEcp,
} from "./support.js"

describe("A1 retrieve via CLI and MCP", () => {
  const cleanups: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.()
  })

  it("plugins link + retrieve --query/--id find test.echo; same via MCP", async () => {
    assertCliBuilt()
    const { env } = await createCliHome({ linkPluginTest: false })

    const link = await runEcp(["plugins", "link", pluginTestRoot, "--no-install"], {
      env,
      timeoutMs: 90_000,
    })
    expect(link.code, link.stderr + link.stdout).toBe(0)

    const query = await runEcp(["retrieve", "--type", "capability", "--query", "echo", "--json"], {
      env,
    })
    expect(query.code).toBe(0)
    const listed = parseJsonStdout<{
      ok: boolean
      data: { items: Array<{ id: string }> }
    }>(query.stdout)
    expect(listed.ok).toBe(true)
    expect(listed.data.items.some((item) => item.id.includes("test.echo"))).toBe(true)
    const id = listed.data.items.find((item) => item.id.includes("test.echo"))!.id

    const one = await runEcp(["retrieve", "--type", "capability", "--id", id, "--json"], { env })
    expect(one.code).toBe(0)
    const detail = parseJsonStdout<{ ok: boolean; data: Record<string, unknown> }>(one.stdout)
    expect(detail.ok).toBe(true)
    const blob = JSON.stringify(detail.data)
    expect(blob).toMatch(/accepts/)
    expect(blob).toMatch(/returns/)

    const session = await openMcpSession({ env })
    cleanups.push(session.close)
    const search = await callTool(session.client, "retrieve", {
      type: "capability",
      query: "echo",
    })
    expect(search.isError).toBeUndefined()
    const items = (search.structuredContent as { items: Array<{ id: string }> }).items
    expect(items.some((item) => item.id.includes("test.echo"))).toBe(true)

    const mcpOne = await callTool(session.client, "retrieve", { type: "capability", id })
    expect(mcpOne.isError).toBeUndefined()
    const mcpBlob = JSON.stringify(mcpOne.structuredContent)
    expect(mcpBlob).toMatch(/accepts/)
    expect(mcpBlob).toMatch(/returns/)
  }, 120_000)
})
