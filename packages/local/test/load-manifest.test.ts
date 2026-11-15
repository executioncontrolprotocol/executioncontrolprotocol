import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { beforeAll, describe, expect, it } from "vitest"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { loadPluginPackage } from "../src/index.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const requireFromSdk = createRequire(path.join(repoRoot, "packages/plugin-sdk/package.json"))
const zodPackageDir = path.dirname(requireFromSdk.resolve("zod/package.json"))
const zodUrl = pathToFileURL(path.join(zodPackageDir, "index.js")).href
const sdkUrl = pathToFileURL(path.join(repoRoot, "packages/plugin-sdk/dist/index.js")).href

describe("loadPluginPackage", () => {
  let tempRoot: string

  beforeAll(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "ecp-load-"))
  })

  it("rejects a missing package.json", async () => {
    const result = await loadPluginPackage(path.join(tempRoot, "absent"), "core")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]?.message).toMatch(/package\.json/)
  })

  it("rejects an invalid on-disk manifest", async () => {
    const root = path.join(tempRoot, "invalid")
    await mkdir(root, { recursive: true })
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "@executioncontrolprotocol/plugin-invalid", version: "1.0.0" }),
    )
    await writeFile(path.join(root, "ecp.manifest.json"), JSON.stringify({ not: "a manifest" }))
    const result = await loadPluginPackage(root, "core")
    expect(result.ok).toBe(false)
  })

  it("rejects a linked package without a default export", async () => {
    const root = path.join(tempRoot, "no-default")
    await mkdir(path.join(root, "dist"), { recursive: true })
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "@executioncontrolprotocol/plugin-empty", version: "1.0.0" }),
    )
    await writeFile(path.join(root, "dist/index.js"), `export const nope = true;\n`)
    const result = await loadPluginPackage(root, "link")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]?.message).toMatch(/default-export/)
  })

  it("rejects a linked package whose definition import throws", async () => {
    const root = path.join(tempRoot, "throws")
    await mkdir(path.join(root, "dist"), { recursive: true })
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "@executioncontrolprotocol/plugin-throws", version: "1.0.0" }),
    )
    await writeFile(path.join(root, "dist/index.js"), `throw new Error("boom");\n`)
    const result = await loadPluginPackage(root, "link")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]?.message).toMatch(/boom/)
  })

  it("regenerates a linked manifest from a valid definition", async () => {
    const root = path.join(tempRoot, "ok-link")
    await mkdir(path.join(root, "dist"), { recursive: true })
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "@executioncontrolprotocol/plugin-ok", version: "1.2.3" }),
    )
    await writeFile(
      path.join(root, "dist/index.js"),
      `
import { capability, definePlugin } from ${JSON.stringify(sdkUrl)};
import { z } from ${JSON.stringify(zodUrl)};
export default definePlugin({
  id: "@executioncontrolprotocol/ok",
  summary: "Ok.",
  description: "Ok plugin.",
  capabilities: {
    ping: capability({
      summary: "Ping.",
      description: "Pong.",
      useCases: ["Ping"],
      projections: ["Pong"],
      accepts: z.object({}),
      returns: z.object({ ok: z.boolean() }),
      handler: () => import("./ping.js"),
    }),
  },
});
`,
    )
    await writeFile(
      path.join(root, "dist/ping.js"),
      `export default async function handler() { return { ok: true }; }\n`,
    )
    const result = await loadPluginPackage(root, "link")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.loaded.manifest.plugin.version).toBe("1.2.3")
      expect(result.loaded.definition).toBeTruthy()
    }
  })
})
