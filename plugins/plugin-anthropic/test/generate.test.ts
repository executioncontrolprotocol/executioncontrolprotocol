import { afterEach, describe, expect, it, vi } from "vitest"
import type { ArtifactFileRef, HandlerContext } from "@executioncontrolprotocol/plugin-sdk"
import generate from "../src/capabilities/generate.js"

interface UsageEntry {
  kind: string
  amount: number
  unit: string
}

function ctx(
  config: Record<string, unknown> | undefined,
  partial: Partial<HandlerContext> = {},
): HandlerContext & { recorded: UsageEntry[] } {
  const recorded: UsageEntry[] = []
  return {
    recorded,
    config,
    signal: new AbortController().signal,
    run: { id: "run-1" },
    step: { id: "step-1" },
    state: Object.freeze({}),
    store: { set() {}, merge() {}, append() {} },
    files: {
      async read() {
        return { bytes: new Uint8Array() }
      },
      async writeArtifact(): Promise<ArtifactFileRef> {
        return { kind: "artifact", uri: "ecp://runs/run-1/artifacts/x" }
      },
    },
    async call() {
      return undefined
    },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    usage: {
      record(entry) {
        recorded.push({ kind: entry.kind, amount: entry.amount, unit: entry.unit })
      },
    },
    ...partial,
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const mock = vi.fn(impl)
  vi.stubGlobal("fetch", mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("anthropic generate", () => {
  it("posts to the Messages API and returns text and usage", async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse(200, {
        content: [
          { type: "text", text: "Hello, " },
          { type: "tool_use", id: "t1" },
          { type: "text", text: "world." },
        ],
        usage: { input_tokens: 12, output_tokens: 5 },
      }),
    )
    const context = ctx({ apiKey: "sk-test", model: "claude-test" })

    const result = await generate({ prompt: "Say hello", system: "Be brief", maxTokens: 64 }, context)

    expect(result).toEqual({ text: "Hello, world.", usage: { inputTokens: 12, outputTokens: 5 } })
    expect(context.recorded).toEqual([
      { kind: "tokens.in", amount: 12, unit: "token" },
      { kind: "tokens.out", amount: 5, unit: "token" },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://api.anthropic.com/v1/messages")
    expect(init.method).toBe("POST")
    expect(init.signal).toBe(context.signal)
    expect(init.headers).toMatchObject({
      "x-api-key": "sk-test",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    })
    expect(JSON.parse(String(init.body))).toEqual({
      model: "claude-test",
      max_tokens: 64,
      system: "Be brief",
      messages: [{ role: "user", content: "Say hello" }],
    })
  })

  it("defaults the model and max_tokens, omits system and honours baseUrl", async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse(200, { content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 1 } }),
    )

    await generate({ prompt: "p" }, ctx({ apiKey: "k", baseUrl: "https://proxy.example.com/" }))

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://proxy.example.com/v1/messages")
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body).toEqual({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: "p" }],
    })
    expect(body).not.toHaveProperty("system")
  })

  it("maps an HTTP 401 to ECP_PROVIDER_ERROR with status and body", async () => {
    const errorBody = { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }
    stubFetch(async () => jsonResponse(401, errorBody))
    const context = ctx({ apiKey: "bad" })

    await expect(generate({ prompt: "p" }, context)).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      message: "Anthropic Messages API returned HTTP 401: invalid x-api-key",
      details: { status: 401, body: errorBody },
    })
    expect(context.recorded).toEqual([])
  })

  it("keeps a non-JSON error body as text", async () => {
    stubFetch(async () => new Response("upstream overloaded", { status: 529 }))

    await expect(generate({ prompt: "p" }, ctx({ apiKey: "k" }))).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      details: { status: 529, body: "upstream overloaded" },
    })
  })

  it("returns empty text and zero usage when the response omits them", async () => {
    stubFetch(async () => jsonResponse(200, {}))
    const context = ctx({ apiKey: "k" })

    await expect(generate({ prompt: "p" }, context)).resolves.toEqual({
      text: "",
      usage: { inputTokens: 0, outputTokens: 0 },
    })
    expect(context.recorded).toEqual([
      { kind: "tokens.in", amount: 0, unit: "token" },
      { kind: "tokens.out", amount: 0, unit: "token" },
    ])
  })

  it("rejects when the signal aborts during the request", async () => {
    stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init.signal!
          if (signal.aborted) {
            reject(signal.reason)
            return
          }
          signal.addEventListener("abort", () => reject(signal.reason), { once: true })
        }),
    )
    const controller = new AbortController()
    const pending = generate({ prompt: "p" }, ctx({ apiKey: "k" }, { signal: controller.signal }))
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  })

  it("rejects immediately when the signal is already aborted", async () => {
    const fetchMock = stubFetch(async (_url, init) => {
      init.signal?.throwIfAborted()
      return jsonResponse(200, {})
    })
    const controller = new AbortController()
    controller.abort()

    await expect(
      generate({ prompt: "p" }, ctx({ apiKey: "k" }, { signal: controller.signal })),
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("fails with ECP_CONFIG_INVALID before calling the API when config is missing or has no apiKey", async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, {}))

    await expect(generate({ prompt: "p" }, ctx(undefined))).rejects.toMatchObject({
      code: "ECP_CONFIG_INVALID",
      details: { issues: expect.any(Array) },
    })
    await expect(generate({ prompt: "p" }, ctx({ model: "m" }))).rejects.toMatchObject({
      code: "ECP_CONFIG_INVALID",
      details: { issues: [expect.objectContaining({ path: "apiKey" })] },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects when fetch fails at the network layer", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed")
    })

    await expect(generate({ prompt: "p" }, ctx({ apiKey: "k" }))).rejects.toThrow("fetch failed")
  })
})

describe("anthropic generate with images", () => {
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  function withFiles(read: (ref: unknown) => Promise<{ bytes: Uint8Array; mediaType?: string }>) {
    return ctx({ apiKey: "k" }, { files: { bytes: read, read } as unknown as HandlerContext["files"] })
  }

  it("sends each image as a base64 block before the prompt, reading bytes through the host", async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse(200, { content: [{ type: "text", text: "{\"pass\":true}" }], usage: { input_tokens: 9, output_tokens: 2 } }),
    )
    const seen: unknown[] = []
    const result = await generate(
      {
        prompt: "Review these.",
        images: [
          { kind: "url", url: "https://cdn.test/a.jpg", mediaType: "image/jpeg" },
          { kind: "artifact", uri: "ecp://runs/run-1/artifacts/b.png" },
        ],
      },
      withFiles(async (ref) => {
        seen.push(ref)
        return seen.length === 1 ? { bytes: new Uint8Array([1, 2, 3]), mediaType: "image/jpeg" } : { bytes: PNG, mediaType: "image/png" }
      }),
    )
    expect(result.text).toBe("{\"pass\":true}")
    expect(seen).toHaveLength(2)
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body)) as {
      messages: Array<{ content: Array<{ type: string; source?: { media_type: string; data: string }; text?: string }> }>
    }
    const content = body.messages[0]!.content
    expect(content.map((block) => block.type)).toEqual(["image", "image", "text"])
    expect(content[0]!.source).toEqual({ type: "base64", media_type: "image/jpeg", data: "AQID" })
    expect(content[1]!.source?.media_type).toBe("image/png")
    expect(content[2]!.text).toBe("Review these.")
  })

  it("keeps a plain string prompt when there are no images", async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, { content: [], usage: {} }))
    await generate({ prompt: "Hi", images: [] }, ctx({ apiKey: "k" }))
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body)) as { messages: Array<{ content: unknown }> }
    expect(body.messages[0]!.content).toBe("Hi")
  })

  it("rejects an image Claude can't read, and one over 5 MB, before calling the API", async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, {}))
    await expect(
      generate(
        { prompt: "p", images: [{ kind: "file", path: "/tmp/a.psd" }] },
        withFiles(async () => ({ bytes: new Uint8Array([1]), mediaType: "image/vnd.adobe.photoshop" })),
      ),
    ).rejects.toMatchObject({ code: "ECP_INPUT_INVALID", message: expect.stringContaining("images[0]") })
    await expect(
      generate(
        { prompt: "p", images: [{ kind: "file", path: "/tmp/big.jpg" }] },
        withFiles(async () => ({ bytes: new Uint8Array(5 * 1024 * 1024 + 1), mediaType: "image/jpeg" })),
      ),
    ).rejects.toMatchObject({ code: "ECP_INPUT_INVALID", message: expect.stringContaining("5 MB") })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
