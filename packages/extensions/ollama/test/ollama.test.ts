import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"
import { globalRegistry } from "@executioncontrolprotocol/core"
import { registerOllamaExtension, ollamaExtension } from "../src/index.js"

type Handler = (input: unknown, ctx: unknown) => Promise<unknown>

function capability(id: string): Handler {
  const cap = ollamaExtension.capabilities.find((c) => c.id === id)
  if (!cap) throw new Error(`missing capability ${id}`)
  return cap.handler as Handler
}

function mockFetch(impl: () => { ok: boolean; status?: number; body?: unknown }) {
  const fn = vi.fn(async () => {
    const r = impl()
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.body,
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
    await registerOllamaExtension()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("registers the extension and exposes generate + evaluate", () => {
    const ext = globalRegistry.getExtension("@executioncontrolprotocol/ollama")
    expect(ext).toBe(ollamaExtension)
    expect(ext?.capabilities.map((c) => c.id)).toEqual(
      expect.arrayContaining(["@executioncontrolprotocol/ollama.generate", "@executioncontrolprotocol/ollama.evaluate"])
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

  it("generate throws on a non-ok API response", async () => {
    mockFetch(() => ({ ok: false, status: 503 }))
    await expect(
      capability("@executioncontrolprotocol/ollama.generate")({ prompt: "x" }, ctx)
    ).rejects.toThrow(/Ollama API error: 503/)
  })

  it("evaluate parses an approval verdict from JSON output", async () => {
    mockFetch(() => ({
      ok: true,
      body: { message: { content: '{"approved":false,"feedback":"off-topic"}' } },
    }))
    const out = (await capability("@executioncontrolprotocol/ollama.evaluate")(
      { artifact: { answer: "nope" }, goal: "be on topic" },
      ctx
    )) as { approved: boolean; feedback?: string }
    expect(out.approved).toBe(false)
    expect(out.feedback).toBe("off-topic")
  })

  it("evaluate fails open with a skip note when output has no JSON", async () => {
    mockFetch(() => ({ ok: true, body: { message: { content: "no json here" } } }))
    const out = (await capability("@executioncontrolprotocol/ollama.evaluate")(
      { artifact: { answer: "x" } },
      ctx
    )) as { approved: boolean; feedback?: string }
    expect(out.approved).toBe(true)
    expect(out.feedback).toContain("skipped")
  })

  it("evaluate approves deterministic off-topic decline without LLM", async () => {
    const fetchMock = mockFetch(() => ({
      ok: true,
      body: { message: { content: '{"approved":false,"feedback":"no"}' } },
    }))
    const out = (await capability("@executioncontrolprotocol/ollama.evaluate")(
      {
        artifact: {
          answer: "I cannot help with weather. Ask about workflows, ECP, or available capabilities.",
        },
        goal: "Politely declines off-topic request and redirects to ECP/workflow topics",
        criteria: "Brief polite decline mentioning workflows, ECP, or capabilities",
      },
      ctx
    )) as { approved: boolean; feedback?: string }
    expect(out.approved).toBe(true)
    expect(out.feedback).toContain("deterministic")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("evaluate rejects patch-like answer for faq classified intent", async () => {
    const fetchMock = mockFetch(() => ({
      ok: true,
      body: { message: { content: '{"approved":true}' } },
    }))
    const out = (await capability("@executioncontrolprotocol/ollama.evaluate")(
      {
        artifact: { answer: "PATCH WORKFLOW demo UPDATE STEP echo" },
        goal: "Explains ECP patching without changing a workflow",
        classifiedIntent: "faq",
      },
      ctx
    )) as { approved: boolean; feedback?: string }
    expect(out.approved).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("evaluate approves minimal echo workflow patch without LLM", async () => {
    const fetchMock = mockFetch(() => ({
      ok: true,
      body: { message: { content: '{"approved":false,"feedback":"not minimal"}' } },
    }))
    const out = (await capability("@executioncontrolprotocol/ollama.evaluate")(
      {
        artifact: {
          schema: "@executioncontrolprotocol.workflow",
          version: "1.0",
          workflow: { id: "echo-test", label: "Echo test" },
          steps: [
            {
              type: "step",
              id: "echo",
              label: "User Friendly Echo",
              uses: "@executioncontrolprotocol/test.echo",
              input: { value: "hello from fluent API" },
              as: "echo",
            },
          ],
        },
        goal: "Patch is minimal and correct",
      },
      ctx
    )) as { approved: boolean; feedback?: string }
    expect(out.approved).toBe(true)
    expect(out.feedback).toContain("deterministic minimal echo patch")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("evaluate approves prose faq patching explanation deterministically", async () => {
    const fetchMock = mockFetch(() => ({
      ok: true,
      body: { message: { content: '{"approved":false}' } },
    }))
    const out = (await capability("@executioncontrolprotocol/ollama.evaluate")(
      {
        artifact: {
          answer:
            "ECP workflow patching applies targeted changes to an existing workflow using a patch document without replacing the whole workflow.",
        },
        goal: "Explains ECP patching without changing a workflow",
        classifiedIntent: "faq",
      },
      ctx
    )) as { approved: boolean; feedback?: string }
    expect(out.approved).toBe(true)
    expect(out.feedback).toContain("deterministic")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("evaluate includes classified intent in judge prompt", async () => {
    const fetchMock = mockFetch(() => ({
      ok: true,
      body: { message: { content: '{"approved":true,"feedback":"ok"}' } },
    }))
    await capability("@executioncontrolprotocol/ollama.evaluate")(
      {
        artifact: {
          answer: "I help with ECP workflows and capabilities.",
        },
        goal: "Review assistant answer quality",
        criteria: "On-topic for general intent",
        classifiedIntent: "general",
      },
      ctx
    )
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>
    }
    const userMessage = body.messages.find((m) => m.role === "user")?.content ?? ""
    const systemMessage = body.messages.find((m) => m.role === "system")?.content ?? ""
    expect(userMessage).toContain("Classified intent: general")
    expect(systemMessage).toContain("classified intent")
  })

  it("evaluate includes citations in the judge prompt", async () => {
    const fetchMock = mockFetch(() => ({
      ok: true,
      body: { message: { content: '{"approved":true,"feedback":"ok"}' } },
    }))
    await capability("@executioncontrolprotocol/ollama.evaluate")(
      {
        artifact: {
          answer: "I cannot help with weather. Ask about workflows, ECP, or available capabilities.",
          citations: [{ kind: "step", id: "echo", detail: "context" }],
        },
        goal: "Review assistant answer quality",
        criteria: "Mentions the cited step in context",
      },
      ctx
    )
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>
    }
    const userMessage = body.messages.find((m) => m.role === "user")?.content ?? ""
    const systemMessage = body.messages.find((m) => m.role === "system")?.content ?? ""
    expect(userMessage).toContain("Citations:")
    expect(userMessage).toContain("cannot help with weather")
    expect(systemMessage).toContain("off-topic decline goals")
  })
})
