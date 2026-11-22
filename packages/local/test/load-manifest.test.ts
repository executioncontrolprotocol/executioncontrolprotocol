import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { beforeAll, describe, expect, it } from "vitest"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { canonicalJson, sha256Hex } from "@executioncontrolprotocol/plugin-sdk"
import { loadPluginPackage, loadPluginSchemaDocument } from "../src/index.js"

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
      JSON.stringify({ name: "@executioncontrolprotocol/invalid", version: "1.0.0" }),
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
      JSON.stringify({ name: "@executioncontrolprotocol/empty", version: "1.0.0" }),
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
      JSON.stringify({ name: "@executioncontrolprotocol/throws", version: "1.0.0" }),
    )
    await writeFile(path.join(root, "dist/index.js"), `throw new Error("boom");\n`)
    const result = await loadPluginPackage(root, "link")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]?.message).toMatch(/boom/)
  })

  it("regenerates linked manifest and schema in memory without disk schema", async () => {
    const root = path.join(tempRoot, "ok-link")
    await mkdir(path.join(root, "dist"), { recursive: true })
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "@executioncontrolprotocol/ok", version: "1.2.3" }),
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
      expect(result.loaded.manifest.version).toBe("2.0")
      expect(result.loaded.schemaDocument.$defs["ping.accepts"]).toBeTruthy()
      expect(result.loaded.definition).toBeTruthy()
    }
  })

  it("rejects an installed package missing ecp.schema.json", async () => {
    const root = path.join(tempRoot, "missing-schema")
    await mkdir(root, { recursive: true })
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "@executioncontrolprotocol/missing-schema", version: "1.0.0" }),
    )
    await writeFile(
      path.join(root, "ecp.manifest.json"),
      JSON.stringify({
        schema: "@executioncontrolprotocol.plugin-manifest",
        version: "2.0",
        plugin: {
          id: "@executioncontrolprotocol/missing-schema",
          package: "@executioncontrolprotocol/missing-schema",
          version: "1.0.0",
          summary: "Missing schema.",
          description: "Missing schema.",
        },
        sdkVersion: "1.0.0",
        pluginSchema: { path: "./ecp.schema.json", hash: "a".repeat(64) },
        capabilities: [
          {
            id: "@executioncontrolprotocol/missing-schema.ping",
            name: "ping",
            summary: "Ping.",
            description: "Ping.",
            useCases: ["Ping"],
            projections: ["Pong"],
          },
        ],
        entry: "./dist/index.js",
        hash: "b".repeat(64),
      }),
    )
    const result = await loadPluginPackage(root, "core")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const schema = await loadPluginSchemaDocument(result.loaded)
    expect(schema.ok).toBe(false)
    if (!schema.ok) {
      expect(schema.issues[0]?.message).toMatch(/ecp\.schema\.json is missing/)
      expect(schema.issues[0]?.suggestions?.[0]).toMatch(/ecp-plugin-manifest/)
    }
  })

  it("rejects a plugin whose id is not its npm package name", async () => {
    const root = path.join(tempRoot, "name-mismatch")
    await mkdir(root, { recursive: true })
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "@executioncontrolprotocol/plugin-renamed", version: "1.0.0" }),
    )
    await writeFile(
      path.join(root, "ecp.manifest.json"),
      JSON.stringify({
        schema: "@executioncontrolprotocol.plugin-manifest",
        version: "2.0",
        plugin: {
          id: "@executioncontrolprotocol/renamed",
          package: "@executioncontrolprotocol/plugin-renamed",
          version: "1.0.0",
          summary: "Mismatch.",
          description: "Mismatch.",
        },
        sdkVersion: "1.0.0",
        pluginSchema: { path: "./ecp.schema.json", hash: "a".repeat(64) },
        capabilities: [
          {
            id: "@executioncontrolprotocol/renamed.ping",
            name: "ping",
            summary: "Ping.",
            description: "Ping.",
            useCases: ["Ping"],
            projections: ["Pong"],
          },
        ],
        entry: "./dist/index.js",
        hash: "b".repeat(64),
      }),
    )
    const result = await loadPluginPackage(root, "core")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "ECP_PLUGIN_LOAD_FAILED",
        path: "/plugin/id",
        message: expect.stringContaining("does not match its npm package name"),
      }),
    ])
  })

  it("rejects corrupt schema JSON", async () => {
    const root = path.join(tempRoot, "corrupt-schema")
    await mkdir(root, { recursive: true })
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "@executioncontrolprotocol/corrupt", version: "1.0.0" }),
    )
    await writeFile(
      path.join(root, "ecp.manifest.json"),
      JSON.stringify({
        schema: "@executioncontrolprotocol.plugin-manifest",
        version: "2.0",
        plugin: {
          id: "@executioncontrolprotocol/corrupt",
          package: "@executioncontrolprotocol/corrupt",
          version: "1.0.0",
          summary: "Corrupt.",
          description: "Corrupt.",
        },
        sdkVersion: "1.0.0",
        pluginSchema: { path: "./ecp.schema.json", hash: "a".repeat(64) },
        capabilities: [
          {
            id: "@executioncontrolprotocol/corrupt.ping",
            name: "ping",
            summary: "Ping.",
            description: "Ping.",
            useCases: ["Ping"],
            projections: ["Pong"],
          },
        ],
        entry: "./dist/index.js",
        hash: "b".repeat(64),
      }),
    )
    await writeFile(path.join(root, "ecp.schema.json"), "{ not json")
    const result = await loadPluginPackage(root, "core")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const schema = await loadPluginSchemaDocument(result.loaded)
    expect(schema.ok).toBe(false)
    if (!schema.ok) expect(schema.issues[0]?.message).toMatch(/ecp\.schema\.json is missing/)
  })

  it("rejects a schema hash mismatch", async () => {
    const root = path.join(tempRoot, "hash-mismatch")
    await mkdir(root, { recursive: true })
    const schemaDocument = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "ecp://plugins/@executioncontrolprotocol/hash/1.0.0/schema.json",
      $defs: {
        "ping.accepts": { type: "object" },
        "ping.returns": { type: "object" },
      },
    }
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "@executioncontrolprotocol/hash", version: "1.0.0" }),
    )
    await writeFile(
      path.join(root, "ecp.manifest.json"),
      JSON.stringify({
        schema: "@executioncontrolprotocol.plugin-manifest",
        version: "2.0",
        plugin: {
          id: "@executioncontrolprotocol/hash",
          package: "@executioncontrolprotocol/hash",
          version: "1.0.0",
          summary: "Hash.",
          description: "Hash.",
        },
        sdkVersion: "1.0.0",
        pluginSchema: { path: "./ecp.schema.json", hash: "0".repeat(64) },
        capabilities: [
          {
            id: "@executioncontrolprotocol/hash.ping",
            name: "ping",
            summary: "Ping.",
            description: "Ping.",
            useCases: ["Ping"],
            projections: ["Pong"],
          },
        ],
        entry: "./dist/index.js",
        hash: "b".repeat(64),
      }),
    )
    await writeFile(path.join(root, "ecp.schema.json"), `${JSON.stringify(schemaDocument, null, 2)}\n`)
    const result = await loadPluginPackage(root, "core")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const schema = await loadPluginSchemaDocument(result.loaded)
    expect(schema.ok).toBe(false)
    if (!schema.ok) {
      expect(schema.issues[0]?.message).toMatch(/hash mismatch/)
      expect(schema.issues[0]?.suggestions?.[0]).toMatch(/ecp-plugin-manifest/)
    }
  })

  it("rejects a 1.0 fat manifest", async () => {
    const root = path.join(tempRoot, "legacy-1")
    await mkdir(root, { recursive: true })
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "@executioncontrolprotocol/legacy", version: "1.0.0" }),
    )
    await writeFile(
      path.join(root, "ecp.manifest.json"),
      JSON.stringify({
        schema: "@executioncontrolprotocol.plugin-manifest",
        version: "1.0",
        plugin: {
          id: "@executioncontrolprotocol/legacy",
          package: "@executioncontrolprotocol/legacy",
          version: "1.0.0",
          summary: "Legacy.",
          description: "Legacy.",
        },
        sdkVersion: "1.0.0",
        capabilities: [
          {
            id: "@executioncontrolprotocol/legacy.ping",
            name: "ping",
            summary: "Ping.",
            description: "Ping.",
            useCases: ["Ping"],
            projections: ["Pong"],
            accepts: { type: "object" },
            returns: { type: "object" },
          },
        ],
        entry: "./dist/index.js",
        hash: "abc",
      }),
    )
    const result = await loadPluginPackage(root, "core")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]?.message).toMatch(/version 2\.0/)
      expect(result.issues[0]?.suggestions?.[0]).toMatch(/ecp-plugin-manifest/)
    }
  })

  it("honours pluginSchema.path override", async () => {
    const root = path.join(tempRoot, "path-override")
    await mkdir(root, { recursive: true })
    const schemaDocument = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "ecp://plugins/@executioncontrolprotocol/override/1.0.0/schema.json",
      $defs: {
        "ping.accepts": { type: "object" },
        "ping.returns": { type: "object", properties: { ok: { type: "boolean" } } },
      },
    }
    const hash = await sha256Hex(canonicalJson(schemaDocument))
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "@executioncontrolprotocol/override", version: "1.0.0" }),
    )
    await writeFile(
      path.join(root, "ecp.manifest.json"),
      JSON.stringify({
        schema: "@executioncontrolprotocol.plugin-manifest",
        version: "2.0",
        plugin: {
          id: "@executioncontrolprotocol/override",
          package: "@executioncontrolprotocol/override",
          version: "1.0.0",
          summary: "Override.",
          description: "Override.",
        },
        sdkVersion: "1.0.0",
        pluginSchema: { path: "./schemas/custom.schema.json", hash },
        capabilities: [
          {
            id: "@executioncontrolprotocol/override.ping",
            name: "ping",
            summary: "Ping.",
            description: "Ping.",
            useCases: ["Ping"],
            projections: ["Pong"],
          },
        ],
        entry: "./dist/index.js",
        hash: "b".repeat(64),
      }),
    )
    await mkdir(path.join(root, "schemas"), { recursive: true })
    await writeFile(
      path.join(root, "schemas/custom.schema.json"),
      `${JSON.stringify(schemaDocument, null, 2)}\n`,
    )
    const result = await loadPluginPackage(root, "core")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.loaded.schemaPath).toMatch(/custom\.schema\.json$/)
    const schema = await loadPluginSchemaDocument(result.loaded)
    expect(schema.ok).toBe(true)
    if (schema.ok) {
      expect(schema.document.$defs["ping.accepts"]).toEqual({ type: "object" })
    }
  })

  it("adds no $defs for step-contract capabilities", async () => {
    const coreRoot = path.join(repoRoot, "plugins/plugin-core")
    const result = await loadPluginPackage(coreRoot, "core")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const schema = await loadPluginSchemaDocument(result.loaded)
    expect(schema.ok).toBe(true)
    // transform is step-contract (no $defs); only parse-csv contributes schemas.
    if (schema.ok) expect(Object.keys(schema.document.$defs).sort()).toEqual(["parse-csv.accepts", "parse-csv.returns"])
  })
})
