import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  buildPluginManifest,
  capability,
  definePlugin,
  serializeManifest,
  zodToJsonSchema,
} from "../src/index.js"

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
  it("is deterministic and stamps package version", async () => {
    const first = await buildPluginManifest({
      definition: plugin,
      packageJson: { name: "@executioncontrolprotocol/plugin-test", version: "2.0.0" },
    })
    const second = await buildPluginManifest({
      definition: plugin,
      packageJson: { name: "@executioncontrolprotocol/plugin-test", version: "2.0.0" },
    })
    expect(serializeManifest(first)).toBe(serializeManifest(second))
    expect(first.plugin.version).toBe("2.0.0")
    expect(first.plugin.package).toBe("@executioncontrolprotocol/plugin-test")
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(first.capabilities[0]?.id).toBe("@executioncontrolprotocol/test.echo")
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

  it("omits configSchema when the plugin has no config", async () => {
    const bare = definePlugin({
      id: "@executioncontrolprotocol/bare",
      summary: "Bare.",
      description: "No config.",
      capabilities: { echo },
    })
    const manifest = await buildPluginManifest({
      definition: bare,
      packageJson: { name: "@executioncontrolprotocol/plugin-bare", version: "1.0.0" },
      entry: "./dist/custom.js",
      sdkVersion: "9.9.9",
    })
    expect(manifest.configSchema).toBeUndefined()
    expect(manifest.entry).toBe("./dist/custom.js")
    expect(manifest.sdkVersion).toBe("9.9.9")
  })
})
