import { afterEach, describe, expect, it } from "vitest"
import {
  assertCliBuilt,
  callTool,
  createCliHome,
  openMcpSession,
  parseJsonStdout,
  pluginTestRoot,
  runEcp,
  waitForHost,
} from "./support.js"

describe("A1 retrieve via CLI and MCP", () => {
  const cleanups: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.()
  })

  it("plugins link + retrieve --query/--id find test.echo; same via MCP", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome({ linkPluginTest: false })
    cleanups.push(async () => {
      await runEcp(["host", "stop", "--force", "--json"], { env }).catch(() => undefined)
    })

    // Link first (no host yet), then start once — avoids restart races during retrieve.
    const link = await runEcp(["plugins", "link", pluginTestRoot, "--no-install"], {
      env,
      timeoutMs: 90_000,
    })
    expect(link.code, link.stderr + link.stdout).toBe(0)

    const start = await runEcp(["host", "start", "--json"], { env, timeoutMs: 60_000 })
    expect(start.code, start.stderr + start.stdout).toBe(0)
    await waitForHost(home)

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
    expect(search.isError, search.text || JSON.stringify(search.structuredContent)).toBeUndefined()
    const items = (search.structuredContent as { items: Array<{ id: string }> }).items
    expect(items.some((item) => item.id.includes("test.echo"))).toBe(true)

    const mcpOne = await callTool(session.client, "retrieve", { type: "capability", id })
    expect(mcpOne.isError, mcpOne.text || JSON.stringify(mcpOne.structuredContent)).toBeUndefined()
    const mcpBlob = JSON.stringify(mcpOne.structuredContent)
    expect(mcpBlob).toMatch(/accepts/)
    expect(mcpBlob).toMatch(/returns/)
  }, 180_000)
})
