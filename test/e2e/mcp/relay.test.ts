import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, describe, expect, it } from "vitest"
import {
  callTool,
  createCliHome,
  ecpBin,
  fixturesRoot,
  openMcpSession,
  pluginTestRoot,
  repoRoot,
  runEcp,
  waitForHost,
} from "./support.js"

describe("mcp relay e2e", () => {
  const cleanups: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.()
  })

  it("tools/list returns exactly three protocol tools", async () => {
    const { env } = await createCliHome()
    const session = await openMcpSession({ env })
    cleanups.push(session.close)
    const listed = await session.client.listTools()
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual(["commit", "execute", "retrieve"])
    for (const tool of listed.tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object" })
      expect(tool.description?.length).toBeGreaterThan(40)
    }
  }, 60_000)

  it("A1 retrieve search and id via MCP", async () => {
    const { env } = await createCliHome()
    const session = await openMcpSession({ env })
    cleanups.push(session.close)

    const search = await callTool(session.client, "retrieve", {
      type: "capability",
      query: "echo",
    })
    expect(search.isError).toBeUndefined()
    const items = (search.structuredContent as { items: Array<{ id: string }> }).items
    expect(items.some((item) => item.id.includes("test.echo"))).toBe(true)
    const id = items.find((item) => item.id.includes("test.echo"))!.id

    const one = await callTool(session.client, "retrieve", { type: "capability", id })
    expect(one.isError).toBeUndefined()
    const blob = JSON.stringify(one.structuredContent)
    expect(blob).toMatch(/accepts/)
    expect(blob).toMatch(/returns/)
  }, 90_000)

  it("retrieve type schema returns path and optional document", async () => {
    const { env } = await createCliHome()
    const session = await openMcpSession({ env })
    cleanups.push(session.close)

    const pathOnly = await callTool(session.client, "retrieve", { type: "schema" })
    expect(pathOnly.isError).toBeUndefined()
    const item = (pathOnly.structuredContent as { item: { path: string; document?: unknown } }).item
    expect(item.path).toContain("execution.schema.json")
    expect(item.document).toBeUndefined()

    const withDoc = await callTool(session.client, "retrieve", { type: "schema", include: ["document"] })
    expect(withDoc.isError).toBeUndefined()
    expect((withDoc.structuredContent as { item: { document: unknown } }).item.document).toBeTypeOf("object")

    const missing = await callTool(session.client, "retrieve", { type: "schema", id: "missing-plugin-id" })
    expect(missing.isError).toBe(true)
  }, 90_000)

  it("A3 validate-fix loop via MCP structuredContent", async () => {
    const { env } = await createCliHome()
    const session = await openMcpSession({ env })
    cleanups.push(session.close)
    const names = [
      "schema-empty-steps",
      "unknown-capability",
      "duplicate-id",
      "expr-syntax",
      "ref-unresolved",
      "plugins-missing",
      "mode-without-as",
      "l2-if-empty-then",
    ]
    for (const name of names) {
      const file = path.join(fixturesRoot, "manifests/invalid", `${name}.ecp.json`)
      const expected = JSON.parse(
        readFileSync(path.join(fixturesRoot, "manifests/invalid", `${name}.expected.json`), "utf8"),
      ) as Array<{ code: string; path: string }>
      const result = await callTool(session.client, "execute", {
        execution: { path: file },
        mode: "validate",
      })
      expect(result.isError, name).toBe(true)
      const issues =
        (result.structuredContent?.error as { issues?: Array<{ code: string; path: string }> })?.issues ?? []
      expect(
        issues.map((row) => ({ code: row.code, path: row.path })),
        name,
      ).toEqual(expected.map((issue) => ({ code: issue.code, path: issue.path })))
    }
  }, 180_000)

  it("execute by relative path, inline, and output.path", async () => {
    const { home, env } = await createCliHome()
    const cwd = path.join(home, "work")
    mkdirSync(cwd, { recursive: true })
    writeFileSync(
      path.join(cwd, "echo.ecp.json"),
      readFileSync(path.join(fixturesRoot, "manifests/runs/echo.ecp.json"), "utf8"),
    )
    const session = await openMcpSession({ env, cwd })
    cleanups.push(session.close)

    const byPath = await callTool(session.client, "execute", {
      execution: { path: "echo.ecp.json" },
    })
    expect(byPath.isError).toBeUndefined()
    expect(JSON.stringify(byPath.structuredContent)).toMatch(/completed|hi/)

    const inline = await callTool(session.client, "execute", {
      execution: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "echo",
            uses: "@executioncontrolprotocol/test.echo",
            input: { value: "inline" },
            as: "out",
          },
        ],
      },
    })
    expect(inline.isError).toBeUndefined()

    const outRel = "result.json"
    const withOut = await callTool(session.client, "execute", {
      execution: { path: "echo.ecp.json" },
      output: { path: outRel },
    })
    expect(withOut.isError).toBeUndefined()
    expect(existsSync(path.join(cwd, outRel))).toBe(true)
  }, 120_000)

  it("commits a draft by relative execution path", async () => {
    const { home, env } = await createCliHome()
    const cwd = path.join(home, "work")
    mkdirSync(cwd, { recursive: true })
    const execPath = path.join(cwd, "draft.ecp.json")
    writeFileSync(execPath, readFileSync(path.join(fixturesRoot, "manifests/runs/echo.ecp.json"), "utf8"))
    const session = await openMcpSession({ env, cwd })
    cleanups.push(session.close)

    const opened = await callTool(session.client, "retrieve", {
      type: "execution",
      path: "draft.ecp.json",
    })
    expect(opened.isError).toBeUndefined()
    const version = (opened.structuredContent as { item: { version: string } }).item.version

    const manifest = JSON.parse(readFileSync(execPath, "utf8")) as Record<string, unknown>
    manifest.execution = { id: "draft", label: "MCP draft" }
    const committed = await callTool(session.client, "commit", {
      type: "execution",
      action: "update",
      path: "draft.ecp.json",
      draft: true,
      ifVersion: version,
      object: manifest,
    })
    expect(committed.isError).toBeUndefined()
    expect(typeof (committed.structuredContent as { version?: string }).version).toBe("string")
    expect(readFileSync(execPath, "utf8")).toContain("MCP draft")
  }, 120_000)

  it("cold start: no host → relay starts it; stdout is MCP frames only", async () => {
    const { home, env } = await createCliHome()
    expect(existsSync(path.join(home, "host.json"))).toBe(false)

    const purity = await runStdoutPurityCheck(env)
    expect(purity.nonJsonLines).toEqual([])
    expect(purity.sawToolsList).toBe(true)

    const session = await openMcpSession({ env })
    cleanups.push(session.close)
    const result = await callTool(session.client, "retrieve", { type: "capability", query: "echo" })
    expect(result.isError).toBeUndefined()
    await waitForHost(home)
    expect(existsSync(path.join(home, "logs", "relay.log"))).toBe(true)
  }, 120_000)

  it("A6: plugin link mid-session and force restart during delay + resume", async () => {
    const { home, env, dataDir } = await createCliHome({ linkPluginTest: false })
    // Start with an empty plugins dir; first retrieve should not see echo.
    writeFileSync(
      path.join(dataDir, "package.json"),
      `${JSON.stringify({ private: true, oclif: { plugins: [] } })}\n`,
    )
    const session = await openMcpSession({ env })
    cleanups.push(async () => {
      await session.close()
    })

    const before = await callTool(session.client, "retrieve", { type: "capability", query: "echo" })
    const beforeItems = (before.structuredContent as { items?: unknown[] })?.items ?? []
    expect(beforeItems.length).toBe(0)

    const link = await runEcp(["plugins", "link", pluginTestRoot, "--no-install"], {
      env,
      timeoutMs: 90_000,
    })
    expect(link.code).toBe(0)
    await waitForHost(home)

    // Poll until the restarted host sees the capability.
    let found = false
    for (let i = 0; i < 40; i++) {
      const after = await callTool(session.client, "retrieve", { type: "capability", query: "echo" })
      const items = (after.structuredContent as { items?: Array<{ id: string }> })?.items ?? []
      if (items.some((item) => item.id.includes("echo"))) {
        found = true
        break
      }
      await delay(500)
    }
    expect(found).toBe(true)

    // Start a long delay without waiting, then force restart, then resume.
    const started = await callTool(session.client, "execute", {
      execution: {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "wait",
            uses: "@executioncontrolprotocol/test.delay",
            input: { ms: 20_000 },
            as: "done",
          },
        ],
      },
      wait: false,
    })
    expect(started.isError).toBeUndefined()
    const runId = (started.structuredContent as { runId?: string }).runId
    expect(runId).toBeTruthy()

    await expect
      .poll(
        async () => {
          const probe = await callTool(session.client, "retrieve", { type: "run", id: runId! })
          if (probe.isError) return undefined
          const probeStatus =
            (probe.structuredContent as { item?: { status?: string } })?.item?.status ??
            (probe.structuredContent as { status?: string }).status
          return probeStatus === "running" ? true : undefined
        },
        { timeout: 15_000, interval: 50 },
      )
      .toBe(true)

    const restart = await runEcp(["host", "restart", "--force", "--json"], { env })
    expect(restart.code).toBe(0)

    // Poll retrieve until the host is back; MCP already retries connection drops.
    let status: string | undefined
    for (let i = 0; i < 90; i++) {
      const interrupted = await callTool(session.client, "retrieve", { type: "run", id: runId! })
      if (!interrupted.isError) {
        status =
          (interrupted.structuredContent as { item?: { status?: string } })?.item?.status ??
          (interrupted.structuredContent as { status?: string }).status
        break
      }
      await delay(500)
    }
    expect(status, "host never became reachable after force restart").toBeTruthy()
    // Force drain/restart may leave interrupted, failed (aborted delay), or already finished.
    expect(["interrupted", "running", "completed", "failed", "cancelled"]).toContain(status)

    const resumed = await callTool(session.client, "execute", { resume: runId! })
    // Resume may complete, no-op on already-terminal runs, or report an error envelope.
    if (!resumed.isError) {
      const resumeStatus = (resumed.structuredContent as { status?: string }).status
      expect(["completed", "interrupted", "running", "failed", "cancelled"]).toContain(resumeStatus)
    } else {
      expect(resumed.text).toMatch(/ECP_/)
    }
  }, 240_000)
})

async function runStdoutPurityCheck(env: NodeJS.ProcessEnv): Promise<{
  nonJsonLines: string[]
  sawToolsList: boolean
}> {
  const child = spawn(process.execPath, [ecpBin, "mcp", "start"], {
    cwd: repoRoot,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  })
  const stdoutChunks: Buffer[] = []
  child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk))

  const init = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "purity", version: "1.0.0" },
    },
  }
  child.stdin.write(`${JSON.stringify(init)}\n`)

  await waitForJsonRpcId(stdoutChunks, 1, 15_000)
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
  )
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`,
  )
  await waitForJsonRpcId(stdoutChunks, 2, 15_000)

  child.kill()
  await delay(200)

  const text = Buffer.concat(stdoutChunks).toString("utf8")
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const nonJsonLines: string[] = []
  let sawToolsList = false
  for (const line of lines) {
    try {
      const msg = JSON.parse(line) as { jsonrpc?: string; result?: { tools?: unknown[] }; id?: number }
      if (msg.jsonrpc !== "2.0") nonJsonLines.push(line)
      if (msg.id === 2 && Array.isArray(msg.result?.tools) && msg.result!.tools!.length === 3) {
        sawToolsList = true
      }
    } catch {
      nonJsonLines.push(line)
    }
  }
  return { nonJsonLines, sawToolsList }
}

async function waitForJsonRpcId(chunks: Buffer[], id: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const text = Buffer.concat(chunks).toString("utf8")
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line) as { id?: number }
        if (msg.id === id) return
      } catch {
        // keep waiting
      }
    }
    await delay(50)
  }
  throw new Error(`timed out waiting for jsonrpc id ${id}`)
}
