import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  buildPluginManifest,
  buildPluginSchemaDocument,
  capability,
  definePlugin,
  serializeManifest,
  serializePluginSchema,
  zodToJsonSchema,
} from "../src/index.js"
import { canonicalJson, sha256Hex } from "../src/canonical.js"

const echo = capability({
  summary: "Echo.",
  description: "Returns the value.",
  useCases: ["Round-trip a string"],
  projections: ["Take echo"],
  accepts: z.object({
    value: z.string(),
    mode: z.enum(["a", "b"]).optional().default("a"),
    tags: z.array(z.string()).optional(),
    meta: z.record(z.string(), z.number()).optional(),
    choice: z.union([z.string(), z.number()]).optional(),
  }),
  returns: z.object({ echo: z.string() }),
  timeoutMs: 1000,
  handler: () => import("./fixtures/echo-handler.js"),
})

const plugin = definePlugin({
  id: "@executioncontrolprotocol/test",
  summary: "Test plugin.",
  description: "Fixture capabilities.",
  config: z.object({ secret: z.string().optional(), label: z.string().default("x") }),
  capabilities: { echo },
})

describe("buildPluginManifest", () => {
  it("emits a light 2.0 manifest linked to the schema document", async () => {
    const packageVersion = "3.1.4"
    const packageJson = { name: "@executioncontrolprotocol/plugin-test", version: packageVersion }
    const schemaDocument = await buildPluginSchemaDocument({ definition: plugin, packageJson })
    const first = await buildPluginManifest({ definition: plugin, packageJson, schemaDocument })
    const second = await buildPluginManifest({ definition: plugin, packageJson, schemaDocument })
    expect(serializeManifest(first)).toBe(serializeManifest(second))
    expect(first.version).toBe("2.0")
    expect(first.plugin.version).toBe(packageVersion)
    expect(first.plugin.package).toBe("@executioncontrolprotocol/plugin-test")
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(first.capabilities[0]?.id).toBe("@executioncontrolprotocol/test.echo")
    expect(first.capabilities[0]).not.toHaveProperty("accepts")
    expect(first.capabilities[0]).not.toHaveProperty("returns")
    expect(first).not.toHaveProperty("configSchema")
    expect(first.pluginSchema.path).toBe("./ecp.schema.json")
    expect(first.pluginSchema.hash).toBe(await sha256Hex(canonicalJson(schemaDocument)))
    expect(JSON.stringify(first)).not.toContain("$schema")
  })

  it("maps zod optional, default, enum, union, array and record", () => {
    const schema = zodToJsonSchema(echo.accepts, "input")
    expect(schema).toMatchObject({ type: "object" })
    const properties = schema.properties as Record<string, Record<string, unknown>>
    expect(properties.value).toMatchObject({ type: "string" })
    expect(properties.mode?.default).toBe("a")
    expect(properties.mode?.enum ?? (properties.mode?.anyOf as unknown[])).toBeTruthy()
    expect(properties.tags).toMatchObject({ type: "array" })
    expect(properties.meta).toMatchObject({ type: "object" })
    expect(properties.choice).toBeTruthy()
    expect(schema).not.toHaveProperty("$schema")
  })

  it("rejects missing package name or version", async () => {
    await expect(
      buildPluginManifest({
        definition: plugin,
        packageJson: { name: "", version: "1.0.0" },
      }),
    ).rejects.toThrow(/missing name/)
    await expect(
      buildPluginManifest({
        definition: plugin,
        packageJson: { name: "@executioncontrolprotocol/plugin-test", version: "" },
      }),
    ).rejects.toThrow(/missing version/)
  })

  it("omits $defs.config when the plugin has no config and honours entry/sdkVersion", async () => {
    const bare = definePlugin({
      id: "@executioncontrolprotocol/bare",
      summary: "Bare.",
      description: "No config.",
      capabilities: { echo },
    })
    const packageJson = { name: "@executioncontrolprotocol/plugin-bare", version: "1.0.0" }
    const schemaDocument = await buildPluginSchemaDocument({ definition: bare, packageJson })
    expect(schemaDocument.$defs.config).toBeUndefined()
    expect(schemaDocument.$id).toBe("ecp://plugins/@executioncontrolprotocol/bare/1.0.0/schema.json")
    expect(schemaDocument.$defs["echo.accepts"]).toBeTruthy()
    expect(schemaDocument.$defs["echo.returns"]).toBeTruthy()
    const manifest = await buildPluginManifest({
      definition: bare,
      packageJson,
      schemaDocument,
      entry: "./dist/custom.js",
      sdkVersion: "9.9.9",
    })
    expect(manifest).not.toHaveProperty("configSchema")
    expect(manifest.entry).toBe("./dist/custom.js")
    expect(manifest.sdkVersion).toBe("9.9.9")
  })

  it("puts config into $defs.config only", async () => {
    const packageJson = { name: "@executioncontrolprotocol/plugin-test", version: "1.0.0" }
    const schemaDocument = await buildPluginSchemaDocument({ definition: plugin, packageJson })
    expect(schemaDocument.$defs.config).toMatchObject({ type: "object" })
    expect(serializePluginSchema(schemaDocument)).toContain("$schema")
  })

  it("omits capability $defs and stamps contract on step-contract capabilities", async () => {
    const step = capability({
      contract: "step",
      code: "script",
      summary: "Transform.",
      description: "Step contract.",
      useCases: ["Reshape data"],
      projections: ["Take the object your step returns"],
      accepts: z.object({}).strict(),
      returns: z.object({}).strict(),
      handler: () => import("./fixtures/echo-handler.js"),
    })
    const core = definePlugin({
      id: "@executioncontrolprotocol/core",
      summary: "Core.",
      description: "Bundled.",
      capabilities: { transform: step },
    })
    const packageJson = { name: "@executioncontrolprotocol/plugin-core", version: "1.0.0" }
    const schemaDocument = await buildPluginSchemaDocument({ definition: core, packageJson })
    expect(schemaDocument.$defs).toEqual({})
    const manifest = await buildPluginManifest({ definition: core, packageJson, schemaDocument })
    expect(manifest.capabilities[0]).toMatchObject({
      id: "@executioncontrolprotocol/core.transform",
      contract: "step",
      code: "script",
    })
  })
})
