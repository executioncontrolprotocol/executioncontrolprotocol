import { describe, expect, it, vi, beforeEach } from "vitest"
import { openaiExtension, registerOpenaiExtension } from "../src/index.js"
import { globalRegistry } from "@executioncontrolprotocol/core"

describe("@executioncontrolprotocol/openai", () => {
  beforeEach(() => {
    registerOpenaiExtension()
    process.env.OPENAI_API_KEY = "test-key"
  })

  it("has generate and evaluate only (no generateText)", () => {
    const ids = openaiExtension.capabilities.map((c) => c.id)
    expect(ids).toContain("@executioncontrolprotocol/openai.generate")
    expect(ids).toContain("@executioncontrolprotocol/openai.evaluate")
    expect(ids).not.toContain("@executioncontrolprotocol/openai.generateText")
  })

  it("generate returns text from Chat Completions API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "openai reply" } }],
        }),
      }))
    )
    const ext = globalRegistry.getExtension("@executioncontrolprotocol/openai")
    const generate = ext?.capabilities.find((c) => c.id === "@executioncontrolprotocol/openai.generate")
    const result = await generate?.handler(
      { prompt: "hello", system: "be brief" },
      { extensionConfig: {}, usage: { increment: vi.fn() } } as never
    )
    expect(result).toEqual({ text: "openai reply" })
  })
})

describe("@executioncontrolprotocol/openai.evaluate", () => {
  beforeEach(() => {
    registerOpenaiExtension()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"approved":false,"feedback":"needs work"}' } }],
        }),
      }))
    )
    process.env.OPENAI_API_KEY = "test-key"
  })

  it("parses evaluation JSON from API", async () => {
    const ext = globalRegistry.getExtension("@executioncontrolprotocol/openai")
    const evaluate = ext?.capabilities.find((c) => c.id === "@executioncontrolprotocol/openai.evaluate")
    const result = await evaluate?.handler(
      { artifact: {}, goal: "quality" },
      { usage: { increment: () => undefined } } as never
    )
    expect(result).toEqual({ approved: false, feedback: "needs work" })
  })
})
