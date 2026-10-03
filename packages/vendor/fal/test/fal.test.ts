import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"
import { globalRegistry } from "@executioncontrolprotocol/core"
import { registerFalExtension, falExtension } from "../src/index.js"
import { resolveFalApiKey } from "../src/resolve-api-key.js"

const mockRun = vi.fn()
const mockSubscribe = vi.fn()
const mockConfig = vi.fn()

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: (...args: unknown[]) => mockConfig(...args),
    run: (...args: unknown[]) => mockRun(...args),
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
  },
}))

type Handler = (input: unknown, ctx: unknown) => Promise<unknown>

function capability(id: string): Handler {
  const cap = falExtension.capabilities.find((c) => c.id === id)
  if (!cap) throw new Error(`missing capability ${id}`)
  return cap.handler as Handler
}

const ctx = {
  extensionConfig: { apiKey: "test-key", defaultMode: "subscribe" as const },
  usage: { increment: vi.fn() },
}

describe("@executioncontrolprotocol/fal", () => {
  beforeEach(async () => {
    await registerFalExtension()
    mockRun.mockReset()
    mockSubscribe.mockReset()
    mockConfig.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("registers the extension and exposes generate", () => {
    const ext = globalRegistry.getExtension("@executioncontrolprotocol/fal")
    expect(ext).toBe(falExtension)
    expect(ext?.capabilities.map((c) => c.id)).toEqual(
      expect.arrayContaining(["@executioncontrolprotocol/fal.generate"])
    )
  })

  it("resolveFalApiKey prefers config over process.env", () => {
    const prev = process.env.FAL_KEY
    process.env.FAL_KEY = "env-key"
    expect(resolveFalApiKey({ apiKey: "cfg-key" })).toBe("cfg-key")
    expect(resolveFalApiKey({})).toBe("env-key")
    if (prev === undefined) delete process.env.FAL_KEY
    else process.env.FAL_KEY = prev
  })

  it("generate returns data via subscribe and records a model call", async () => {
    mockSubscribe.mockResolvedValue({
      data: { images: [{ url: "https://fal.media/img.png" }] },
      requestId: "req-1",
    })
    const out = (await capability("@executioncontrolprotocol/fal.generate")(
      {
        endpoint: "fal-ai/flux/schnell",
        input: { prompt: "sunset" },
      },
      ctx
    )) as { data: unknown; requestId?: string }
    expect(out.data).toEqual({ images: [{ url: "https://fal.media/img.png" }] })
    expect(out.requestId).toBe("req-1")
    expect(ctx.usage.increment).toHaveBeenCalledWith({ modelCalls: 1 })
    expect(mockConfig).toHaveBeenCalledWith({ credentials: "test-key" })
    expect(mockSubscribe).toHaveBeenCalledWith("fal-ai/flux/schnell", {
      input: { prompt: "sunset" },
      logs: false,
    })
  })

  it("generate uses run mode when requested", async () => {
    mockRun.mockResolvedValue({
      data: { images: [{ url: "https://fal.media/run.png" }] },
      requestId: "req-run",
    })
    const out = (await capability("@executioncontrolprotocol/fal.generate")(
      {
        endpoint: "fal-ai/flux/schnell",
        input: { prompt: "city" },
        mode: "run",
      },
      ctx
    )) as { data: unknown; requestId?: string }
    expect(out.requestId).toBe("req-run")
    expect(mockRun).toHaveBeenCalledWith("fal-ai/flux/schnell", {
      input: { prompt: "city" },
    })
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it("generate uses defaultEndpoint from config", async () => {
    mockSubscribe.mockResolvedValue({ data: {}, requestId: "req-2" })
    await capability("@executioncontrolprotocol/fal.generate")(
      { input: { prompt: "test" } },
      { ...ctx, extensionConfig: { apiKey: "test-key", defaultEndpoint: "fal-ai/default" } }
    )
    expect(mockSubscribe).toHaveBeenCalledWith(
      "fal-ai/default",
      expect.objectContaining({ input: { prompt: "test" } })
    )
  })

  it("generate throws when api key is missing", async () => {
    await expect(
      capability("@executioncontrolprotocol/fal.generate")(
        { endpoint: "fal-ai/flux/schnell", input: { prompt: "x" } },
        { ...ctx, extensionConfig: {} }
      )
    ).rejects.toThrow(/FAL API key required/)
  })

  it("generate throws when endpoint is missing", async () => {
    await expect(
      capability("@executioncontrolprotocol/fal.generate")(
        { input: { prompt: "x" } },
        { ...ctx, extensionConfig: { apiKey: "k" } }
      )
    ).rejects.toThrow(/FAL endpoint required/)
  })

  it("generate surfaces API errors", async () => {
    mockSubscribe.mockRejectedValue(new Error("401 Unauthorized"))
    await expect(
      capability("@executioncontrolprotocol/fal.generate")(
        { endpoint: "fal-ai/flux/schnell", input: { prompt: "x" } },
        ctx
      )
    ).rejects.toThrow(/FAL API error.*401 Unauthorized/)
  })
})
