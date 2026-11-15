import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildPluginManifest, serializeManifest, zodToJsonSchema } from "@executioncontrolprotocol/plugin-sdk"
import plugin, { adobeConfigSchema, GENERATED_CAPABILITY_COUNT, PLUGIN_ID } from "../src/index.js"
import { generatedCapabilities } from "../src/generated/index.js"
import type { AdobeOperation } from "../src/runtime/invoke-capability.js"

const familyModules = import.meta.glob<{ operations: Record<string, AdobeOperation>; load: (name: string) => unknown }>(
  "../src/generated/*/operations.ts",
  { eager: true },
)

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { name: string; version: string }
const meta = JSON.parse(readFileSync(join(root, "src", "generated", "meta.json"), "utf8")) as {
  families: string[]
  capabilities: Array<{ name: string; asyncMode: string }>
}

describe("plugin definition", () => {
  it("declares the plugin id, config schema and every generated capability", () => {
    expect(plugin.id).toBe(PLUGIN_ID)
    expect(plugin.config).toBe(adobeConfigSchema)
    expect(Object.keys(plugin.capabilities).sort()).toEqual(meta.capabilities.map((c) => c.name).sort())
    expect(Object.keys(plugin.capabilities)).toHaveLength(GENERATED_CAPABILITY_COUNT)
    expect(plugin.capabilities).toHaveProperty("photoshop-actions")
    expect(plugin.capabilities).toHaveProperty("firefly-generate-images-v3-async")
  })

  it("gives every capability metadata, a lazy handler and an async-aware timeout", () => {
    const asyncNames = new Set(meta.capabilities.filter((c) => c.asyncMode === "submit").map((c) => c.name))
    for (const [name, cap] of Object.entries(plugin.capabilities)) {
      expect(cap.summary.length, name).toBeGreaterThan(0)
      expect(cap.description.length, name).toBeGreaterThan(0)
      expect(cap.useCases.length, name).toBeGreaterThan(0)
      expect(cap.projections.length, name).toBeGreaterThan(0)
      expect(typeof cap.handler, name).toBe("function")
      expect(cap.timeoutMs, name).toBe(asyncNames.has(name) ? 600_000 : 120_000)
    }
  })

  it("loads a handler function for every capability", async () => {
    for (const [name, cap] of Object.entries(generatedCapabilities)) {
      const mod = await cap.handler()
      expect(typeof mod.default, name).toBe("function")
    }
  })

  it("requires clientId and clientSecret in config and validates URLs", () => {
    expect(adobeConfigSchema.safeParse({ clientId: "a", clientSecret: "b" }).success).toBe(true)
    expect(adobeConfigSchema.safeParse({ clientId: "a" }).success).toBe(false)
    expect(adobeConfigSchema.safeParse({ clientId: "", clientSecret: "b" }).success).toBe(false)
    expect(adobeConfigSchema.safeParse({ clientId: "a", clientSecret: "b", baseUrl: "not a url" }).success).toBe(false)
    expect(adobeConfigSchema.safeParse({ clientId: "a", clientSecret: "b", pollIntervalMs: 0 }).success).toBe(false)
  })
})

describe("photoshop-actions accepts", () => {
  const accepts = plugin.capabilities["photoshop-actions"].accepts

  it("takes options.uxp.source.content as a string capped at the API's maxLength", () => {
    const schema = zodToJsonSchema(accepts, "input") as {
      properties: { options: { properties: { uxp: { properties: { source: { properties: { content: unknown } } } } } } }
    }
    expect(schema.properties.options.properties.uxp.properties.source.properties.content).toMatchObject({
      type: "string",
      maxLength: 51_200,
    })
  })

  it("accepts a script string and rejects unknown keys and oversized scripts", () => {
    expect(accepts.safeParse({ options: { uxp: { source: { content: "app.activeDocument" } } } }).success).toBe(true)
    expect(accepts.safeParse({ options: { uxp: { source: { content: "x".repeat(51_201) } } } }).success).toBe(false)
    expect(accepts.safeParse({ notAField: 1 }).success).toBe(false)
    expect(accepts.safeParse({ options: { uxp: { source: { content: 42 } } } }).success).toBe(false)
  })

  it("accepts an empty input because every body field may come from body", () => {
    expect(accepts.safeParse({}).success).toBe(true)
  })
})

describe("generated operation tables", () => {
  it("parse every body schema and match the capability set", () => {
    const names = new Set<string>()
    expect(Object.keys(familyModules)).toHaveLength(meta.families.length)
    for (const { operations } of Object.values(familyModules)) {
      for (const [name, op] of Object.entries(operations)) {
        names.add(name)
        expect(op.serverUrl, name).toMatch(/^https:\/\//)
        if (op.bodySchema) expect(typeof op.bodySchema.safeParse({}).success, name).toBe("boolean")
      }
    }
    expect([...names].sort()).toEqual(Object.keys(plugin.capabilities).sort())
  })

  it("refuse an operation name the family does not define", () => {
    for (const [path, { load }] of Object.entries(familyModules)) {
      expect(() => load("not-an-operation"), path).toThrow(/Unknown Adobe .+ operation not-an-operation\./)
    }
  })
})

describe("ecp.manifest.json", () => {
  it("matches a manifest built from the definition", async () => {
    const manifest = await buildPluginManifest({ definition: plugin, packageJson })
    const committed = readFileSync(join(root, "ecp.manifest.json"), "utf8").replace(/\r\n/g, "\n")
    expect(serializeManifest(manifest)).toBe(committed)
    expect(manifest.capabilities).toHaveLength(GENERATED_CAPABILITY_COUNT)
  })
})
