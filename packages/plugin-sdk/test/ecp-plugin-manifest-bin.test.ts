import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { spawn } from "node:child_process"
import { beforeAll, describe, expect, it } from "vitest"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const binPath = path.join(repoRoot, "packages/plugin-sdk/dist/bin/ecp-plugin-manifest.js")
const requireFromSdk = createRequire(path.join(repoRoot, "packages/plugin-sdk/package.json"))
const zodPackageDir = path.dirname(requireFromSdk.resolve("zod/package.json"))
const zodUrl = pathToFileURL(path.join(zodPackageDir, "index.js")).href
const sdkUrl = pathToFileURL(path.join(repoRoot, "packages/plugin-sdk/dist/index.js")).href

async function runBin(
  cwd: string,
  args: string[] = [],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [binPath, ...args], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8")
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

async function writePluginPackage(root: string): Promise<void> {
  await mkdir(path.join(root, "dist"), { recursive: true })
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "@executioncontrolprotocol/plugin-bin-fixture",
      version: "1.2.3",
      type: "module",
    }),
  )
  await writeFile(
    path.join(root, "dist/index.js"),
    `
import { capability, definePlugin } from ${JSON.stringify(sdkUrl)};
import { z } from ${JSON.stringify(zodUrl)};
export default definePlugin({
  id: "@executioncontrolprotocol/bin-fixture",
  summary: "Bin fixture.",
  description: "Used by ecp-plugin-manifest bin tests.",
  capabilities: {
    ping: capability({
      summary: "Ping.",
      description: "Pong.",
      useCases: ["Ping"],
      projections: ["Pong"],
      accepts: z.object({}),
      returns: z.object({ ok: z.boolean() }),
      handler: async () => ({ default: async () => ({ ok: true }) }),
    }),
  },
});
`,
  )
}

describe("ecp-plugin-manifest bin", () => {
  let tempRoot: string

  beforeAll(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "ecp-bin-manifest-"))
  })

  it("writes both ecp.manifest.json and ecp.schema.json", async () => {
    const root = path.join(tempRoot, "write")
    await writePluginPackage(root)
    const result = await runBin(root)
    expect(result.code, result.stderr).toBe(0)
    const manifest = JSON.parse(await readFile(path.join(root, "ecp.manifest.json"), "utf8")) as {
      version: string
      pluginSchema: { path: string; hash: string }
      capabilities: Array<Record<string, unknown>>
    }
    const schema = JSON.parse(await readFile(path.join(root, "ecp.schema.json"), "utf8")) as {
      $id: string
      $defs: Record<string, unknown>
    }
    expect(manifest.version).toBe("2.0")
    expect(manifest.pluginSchema.path).toBe("./ecp.schema.json")
    expect(manifest.pluginSchema.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(manifest.capabilities[0]).not.toHaveProperty("accepts")
    expect(schema.$id).toBe("ecp://plugins/@executioncontrolprotocol/bin-fixture/1.2.3/schema.json")
    expect(schema.$defs["ping.accepts"]).toBeTruthy()
    expect(schema.$defs["ping.returns"]).toBeTruthy()
  })

  it("passes --check when both files match", async () => {
    const root = path.join(tempRoot, "check-ok")
    await writePluginPackage(root)
    expect((await runBin(root)).code).toBe(0)
    const check = await runBin(root, ["--check"])
    expect(check.code, check.stderr).toBe(0)
    expect(check.stdout).toMatch(/match/)
  })

  it("fails --check when the schema file is missing", async () => {
    const root = path.join(tempRoot, "missing-schema")
    await writePluginPackage(root)
    expect((await runBin(root)).code).toBe(0)
    const { unlink } = await import("node:fs/promises")
    await unlink(path.join(root, "ecp.schema.json"))
    const check = await runBin(root, ["--check"])
    expect(check.code).toBe(1)
    expect(check.stderr).toMatch(/ecp\.schema\.json is missing/)
  })

  it("fails --check when schema content drifts", async () => {
    const root = path.join(tempRoot, "schema-drift")
    await writePluginPackage(root)
    expect((await runBin(root)).code).toBe(0)
    const schemaPath = path.join(root, "ecp.schema.json")
    const schema = JSON.parse(await readFile(schemaPath, "utf8")) as {
      $defs: Record<string, unknown>
    }
    schema.$defs["extra.accepts"] = { type: "string" }
    await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`)
    const check = await runBin(root, ["--check"])
    expect(check.code).toBe(1)
    expect(check.stderr).toMatch(/ecp\.schema\.json is out of date|pluginSchema\.hash/)
  })

  it("fails --check when the manifest hash link is wrong", async () => {
    const root = path.join(tempRoot, "hash-link")
    await writePluginPackage(root)
    expect((await runBin(root)).code).toBe(0)
    const manifestPath = path.join(root, "ecp.manifest.json")
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      pluginSchema: { path: string; hash: string }
      hash: string
    }
    manifest.pluginSchema.hash = "0".repeat(64)
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    const check = await runBin(root, ["--check"])
    expect(check.code).toBe(1)
    expect(check.stderr).toMatch(/out of date|pluginSchema\.hash/)
  })
})
