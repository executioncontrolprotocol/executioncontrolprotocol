import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"
import { execFile } from "node:child_process"
import { META_TOOL_NAMES } from "../../src/constants.js"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..")
const cliBin = join(repoRoot, "packages", "cli", "bin", "run.js")

const JSONATA_SOURCE = `import { workflow, step } from "@executioncontrolprotocol/core"
export default workflow("J").run([
  step("@executioncontrolprotocol/jsonata.transform", "T").with({
    expression: "a",
    payload: { a: 1 },
  }).as("out"),
])
`

type TextContent = { type: string; text: string }

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

function runCli(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [cliBin, ...args],
      { cwd: repoRoot, encoding: "utf8", env, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === "number"
            ? (err as { code: number }).code
            : err
              ? 1
              : 0
        resolve({ code, stdout, stderr })
      }
    )
  })
}

async function hermeticEnv(): Promise<{ dir: string; env: NodeJS.ProcessEnv }> {
  const dir = await mkdtemp(join(tmpdir(), "ecp-mcp-stdio-"))
  return {
    dir,
    env: {
      ...process.env,
      ECP_DATA_DIR: dir,
      ECP_CONFIG_DIR: dir,
      ECP_RUNS_DIR: join(dir, "runs"),
    },
  }
}

async function connect(env: NodeJS.ProcessEnv): Promise<{ client: Client; transport: StdioClientTransport }> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliBin, "mcp", "serve"],
    env: stringEnv(env),
    cwd: repoRoot,
    stderr: "pipe",
  })
  const client = new Client({ name: "stdio-test", version: "1.0.0" })
  await client.connect(transport)
  return { client, transport }
}

describe("ecp mcp serve over stdio", () => {
  let home: string
  let env: NodeJS.ProcessEnv

  beforeAll(async () => {
    const hermetic = await hermeticEnv()
    home = hermetic.dir
    env = hermetic.env
    const mcp = await runCli(["plugins", "link", "packages/mcp"], env)
    expect(mcp.code).toBe(0)
    const jsonata = await runCli(["plugins", "link", "plugins/plugin-jsonata"], env)
    expect(jsonata.code).toBe(0)
  }, 120_000)

  afterAll(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it("lists meta tools plus jsonata_transform", async () => {
    const { client } = await connect(env)
    try {
      const names = (await client.listTools()).tools.map((t) => t.name)
      expect(names).toEqual(expect.arrayContaining([...META_TOOL_NAMES, "jsonata_transform"]))
    } finally {
      await client.close()
    }
  }, 60_000)

  it("calls jsonata_transform", async () => {
    const { client } = await connect(env)
    try {
      const res = await client.callTool({
        name: "jsonata_transform",
        arguments: { expression: "b", payload: { b: "ok" } },
      })
      const text = (res.content as TextContent[]).find((c) => c.type === "text")?.text
      const envelope = JSON.parse(text ?? "{}") as { ok: boolean; data: unknown }
      expect(envelope.ok).toBe(true)
      expect(envelope.data).toEqual({ result: "ok" })
    } finally {
      await client.close()
    }
  }, 60_000)

  it("runs a workflow from source", async () => {
    const { client } = await connect(env)
    try {
      const res = await client.callTool({
        name: "ecp_run",
        arguments: { source: JSONATA_SOURCE },
      })
      const text = (res.content as TextContent[]).find((c) => c.type === "text")?.text
      const envelope = JSON.parse(text ?? "{}") as {
        ok: boolean
        data: { run: { status: string }; runId: string }
      }
      expect(envelope.ok).toBe(true)
      expect(envelope.data.run.status).toBe("completed")
      expect(envelope.data.runId).toBeTruthy()
    } finally {
      await client.close()
    }
  }, 60_000)

  it("receives progress during a run", async () => {
    const { client } = await connect(env)
    try {
      const progress: { message?: string }[] = []
      const res = await client.callTool(
        { name: "ecp_run", arguments: { source: JSONATA_SOURCE, events: true } },
        CallToolResultSchema,
        { onprogress: (event) => progress.push(event) }
      )
      const text = (res.content as TextContent[]).find((c) => c.type === "text")?.text
      const envelope = JSON.parse(text ?? "{}") as { ok: boolean }
      expect(envelope.ok).toBe(true)
      expect(progress.some((p) => p.message === "run.start")).toBe(true)
      expect(progress.some((p) => p.message === "run.end")).toBe(true)
    } finally {
      await client.close()
    }
  }, 60_000)
})

describe("ecp mcp serve list_changed after a plugin link", () => {
  it("notifies when jsonata is linked while the server is running", async () => {
    const hermetic = await hermeticEnv()
    try {
      const mcp = await runCli(["plugins", "link", "packages/mcp"], hermetic.env)
      expect(mcp.code).toBe(0)
      const { client } = await connect(hermetic.env)
      try {
        let notifications = 0
        client.fallbackNotificationHandler = async (notification) => {
          if (notification.method === "notifications/tools/list_changed") notifications += 1
        }
        const before = (await client.listTools()).tools.map((t) => t.name)
        expect(before).not.toContain("jsonata_transform")
        const linked = await runCli(["plugins", "link", "plugins/plugin-jsonata"], hermetic.env)
        expect(linked.code).toBe(0)
        await viWaitFor(() => notifications > 0, 20_000)
        const after = (await client.listTools()).tools.map((t) => t.name)
        expect(after).toContain("jsonata_transform")
      } finally {
        await client.close()
      }
    } finally {
      await rm(hermetic.dir, { recursive: true, force: true })
    }
  }, 120_000)
})

async function viWaitFor(predicate: () => boolean, timeout: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`timed out after ${timeout}ms`)
}
