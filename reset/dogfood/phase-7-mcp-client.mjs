#!/usr/bin/env node
/**
 * Local MCP SDK stdio proofs for Phase 7 dogfood (not Claude Desktop).
 * Usage: node reset/dogfood/phase-7-mcp-client.mjs
 */
import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const sdkRoot = join(
  repoRoot,
  "packages",
  "mcp",
  "node_modules",
  "@modelcontextprotocol",
  "sdk",
  "dist",
  "esm"
)
const { Client } = await import(pathToFileURL(join(sdkRoot, "client/index.js")).href)
const { StdioClientTransport } = await import(pathToFileURL(join(sdkRoot, "client/stdio.js")).href)

const cliBin = join(repoRoot, "packages", "cli", "bin", "run.js")
const dogfood = join(repoRoot, "reset", "dogfood")

function stringEnv(env) {
  const out = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

function runCli(args, env) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [cliBin, ...args],
      { cwd: repoRoot, encoding: "utf8", env, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code =
          err && typeof err.code === "number" ? err.code : err ? 1 : 0
        resolve({ code, stdout, stderr })
      }
    )
  })
}

async function connect(env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliBin, "mcp", "serve"],
    env: stringEnv(env),
    cwd: repoRoot,
    stderr: "pipe",
  })
  const client = new Client({ name: "phase-7-dogfood", version: "1.0.0" })
  await client.connect(transport)
  return client
}

function envelope(result) {
  const text = result.content?.find((c) => c.type === "text")?.text
  if (!text) return { ok: false, error: { message: "no text content", isError: result.isError } }
  try {
    return JSON.parse(text)
  } catch {
    return { ok: false, error: { message: text, isError: result.isError } }
  }
}

async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args })
  return envelope(result)
}

const hermetic = await mkdtemp(join(tmpdir(), "ecp-dogfood-phase7-"))
const env = {
  ...process.env,
  ECP_DATA_DIR: hermetic,
  ECP_CONFIG_DIR: hermetic,
  ECP_RUNS_DIR: join(hermetic, "runs"),
}

const links = [
  "packages/mcp",
  "plugins/plugin-jsonata",
  "plugins/plugin-image-sharp",
  "plugins/plugin-azure-blob-storage",
  "plugins/plugin-approval",
  "plugins/plugin-format-mermaid",
  "plugins/plugin-ollama",
]
for (const spec of links) {
  const linked = await runCli(["plugins", "link", spec], env)
  if (linked.code !== 0) {
    console.error(`link ${spec} failed`, linked)
    process.exit(1)
  }
}

const client = await connect(env)
try {
  const tools = (await client.listTools()).tools.map((t) => t.name)
  console.log(
    JSON.stringify(
      {
        hermetic,
        tools: {
          jsonata_transform: tools.includes("jsonata_transform"),
          formatMermaidEncode: tools.includes("format-mermaid_encode"),
        },
        task1Fail: await call(client, "ecp_run", {
          path: join(dogfood, "01-reshape.fail.ecp.ts"),
        }),
        task1Ok: await call(client, "ecp_run", {
          path: join(dogfood, "01-reshape.ecp.ts"),
        }),
        task2Fail: await call(client, "ecp_run", {
          path: join(dogfood, "02-photo.fail.ecp.ts"),
        }),
        task2Ok: await call(client, "ecp_run", {
          path: join(dogfood, "02-photo.ecp.ts"),
        }),
        task3Compile: JSON.parse(
          (await runCli(["compile", join(dogfood, "03-caption.ecp.ts"), "--json"], env)).stdout
        ),
        task3Mermaid: await call(client, "format-mermaid_encode", {
          source: JSON.parse(
            (await runCli(["compile", join(dogfood, "03-caption.ecp.ts"), "--json"], env)).stdout
          ).data,
          sourceSchema: "@executioncontrolprotocol.workflow",
        }),
        task3Run: await call(client, "ecp_run", {
          path: join(dogfood, "03-caption.ecp.ts"),
        }),
      },
      null,
      2
    )
  )
} finally {
  await client.close()
  await rm(hermetic, { recursive: true, force: true })
}
