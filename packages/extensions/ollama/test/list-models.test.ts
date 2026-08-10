import { describe, expect, it, afterEach, vi } from "vitest"
import { listOllamaModels } from "../src/list-models.js"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("listOllamaModels", () => {
  it("parses sorted unique model names from /api/tags", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        models: [{ name: "b:latest" }, { name: "a:latest" }, { name: "b:latest" }],
      }),
      text: async () => "",
    }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(listOllamaModels("http://localhost:11434/")).resolves.toEqual([
      "a:latest",
      "b:latest",
    ])
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://localhost:11434/api/tags")
  })

  it("throws a clear error on non-OK status with body snippet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => "internal failure detail",
      }))
    )
    await expect(listOllamaModels("http://localhost:11434")).rejects.toThrow(
      /Ollama API error: 500 \(internal failure detail\)/
    )
  })

  it("throws when base URL is empty", async () => {
    await expect(listOllamaModels("   ")).rejects.toThrow(/base URL is required/)
  })

  it("wraps network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch")
      })
    )
    await expect(listOllamaModels("http://localhost:11434")).rejects.toThrow(
      /Ollama unreachable at http:\/\/localhost:11434: Failed to fetch/
    )
  })
})
