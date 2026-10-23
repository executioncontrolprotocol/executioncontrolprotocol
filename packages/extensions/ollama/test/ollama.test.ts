import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"
import { Registry } from "@executioncontrolprotocol/core"
import { registerOllamaExtension, ollamaExtension } from "../src/index.js"

type Handler = (input: unknown, ctx: unknown) => Promise<unknown>

function capability(id: string): Handler {
  const cap = ollamaExtension.capabilities.find((c) => c.id === id)
  if (!cap) throw new Error(`missing capability ${id}`)
  return cap.handler as Handler
}

function mockFetch(impl: () => { ok: boolean; status?: number; body?: unknown; text?: string }) {
  const fn = vi.fn(async () => {
    const r = impl()
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.body,
      text: async () =>
        r.text ?? (typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? "")),
    } as unknown as Response
  })
  vi.stubGlobal("fetch", fn)
  return fn
}

const ctx = {
  extensionConfig: { baseURL: "http://localhost:11434", defaultModel: "test-model" },
  usage: { increment: vi.fn() },
}

describe("@executioncontrolprotocol/ollama", () => {
  beforeEach(async () => {
    await registerOllamaExtension(new Registry())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("registers the extension and exposes generate and listModels", () => {
    const ext = ollamaExtension
    expect(ext).toBe(ollamaExtension)
    const ids = ext?.capabilities.map((c) => c.id) ?? []
    expect(ids).toEqual(
      expect.arrayContaining([
        "@executioncontrolprotocol/ollama.generate",
        "@executioncontrolprotocol/ollama.listModels",
      ])
    )
    expect(ids).not.toContain("@executioncontrolprotocol/ollama.evaluate")
  })

  it("listModels returns sorted unique tags from /api/tags", async () => {
    const fetchMock = mockFetch(() => ({
      ok: true,
      body: {
        models: [
          { name: "qwen2.5-coder:7b" },
          { name: "gemma3:1b" },
          { name: "qwen2.5-coder:7b" },
          { name: "  " },
          {},
        ],
      },
    }))
    const out = (await capability("@executioncontrolprotocol/ollama.listModels")({}, ctx)) as {
      models: string[]
    }
    expect(out.models).toEqual(["gemma3:1b", "qwen2.5-coder:7b"])
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://localhost:11434/api/tags")
  })

  it("listModels prefers input baseURL over extension config", async () => {
    const fetchMock = mockFetch(() => ({ ok: true, body: { models: [{ name: "a:latest" }] } }))
    await capability("@executioncontrolprotocol/ollama.listModels")(
      { baseURL: "http://127.0.0.1:11434/" },
      ctx
    )
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://127.0.0.1:11434/api/tags")
  })

  it("listModels throws on a non-ok API response", async () => {
    mockFetch(() => ({ ok: false, status: 404, body: "not found" }))
    // mockFetch only supports json(); override for text body path
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => "model missing",
        json: async () => ({}),
      })) as unknown as typeof fetch
    )
    await expect(capability("@executioncontrolprotocol/ollama.listModels")({}, ctx)).rejects.toThrow(
      /Ollama API error: 404/
    )
  })

  it("generate returns model text and records a model call", async () => {
    const fetchMock = mockFetch(() => ({ ok: true, body: { message: { content: "hi there" } } }))
    const out = (await capability("@executioncontrolprotocol/ollama.generate")(
      { prompt: "say hi", model: "test-model" },
      ctx
    )) as { text: string }
    expect(out.text).toBe("hi there")
    expect(ctx.usage.increment).toHaveBeenCalledWith({ modelCalls: 1 })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("generate throws on a non-ok API response including body detail", async () => {
    mockFetch(() => ({ ok: false, status: 500, text: '{"error":"model requires more memory"}' }))
    await expect(
      capability("@executioncontrolprotocol/ollama.generate")({ prompt: "x" }, ctx)
    ).rejects.toThrow(/Ollama API error: 500 for model "test-model".*model requires more memory/)
  })
})
