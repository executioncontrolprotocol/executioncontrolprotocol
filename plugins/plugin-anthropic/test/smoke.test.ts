import { describe, expect, it } from "vitest"
import plugin, { anthropicConfigSchema, generateAcceptsSchema, ANTHROPIC_DEFAULT_MODEL } from "../src/index.js"

describe("plugin-anthropic", () => {
  it("exports the anthropic plugin definition with one generate capability", () => {
    expect(plugin.id).toBe("@executioncontrolprotocol/anthropic")
    expect(Object.keys(plugin.capabilities)).toEqual(["generate"])
    expect(plugin.capabilities.generate.timeoutMs).toBe(120_000)
    expect(plugin.capabilities.generate.useCases.length).toBeGreaterThan(0)
    expect(plugin.capabilities.generate.projections.length).toBeGreaterThan(0)
  })

  it("loads the generate handler through its lazy thunk", async () => {
    const mod = await plugin.capabilities.generate.handler()
    expect(typeof mod.default).toBe("function")
  })

  it("defaults the model and rejects a bad base URL or missing key", () => {
    expect(anthropicConfigSchema.parse({ apiKey: "k" })).toEqual({ apiKey: "k", model: ANTHROPIC_DEFAULT_MODEL })
    expect(anthropicConfigSchema.safeParse({ apiKey: "k", baseUrl: "not a url" }).success).toBe(false)
    expect(anthropicConfigSchema.safeParse({ model: "m" }).success).toBe(false)
  })

  it("rejects non-positive or fractional maxTokens", () => {
    expect(generateAcceptsSchema.safeParse({ prompt: "hi", maxTokens: 0 }).success).toBe(false)
    expect(generateAcceptsSchema.safeParse({ prompt: "hi", maxTokens: 1.5 }).success).toBe(false)
    expect(generateAcceptsSchema.safeParse({ prompt: "hi", maxTokens: 10 }).success).toBe(true)
  })
})
