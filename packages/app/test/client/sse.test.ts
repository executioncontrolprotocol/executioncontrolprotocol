import { describe, expect, it, vi } from "vitest"
import type { FetchLike } from "../../src/client/api.js"
import {
  backoffDelay,
  dispatchSseMessage,
  parseSseChunk,
  SSE_MAX_DELAY_MS,
  SSE_MIN_DELAY_MS,
  watchSse,
  type SseHandlers,
} from "../../src/client/sse.js"

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

function sseResponse(chunks: string[]): Response {
  return new Response(streamOf(chunks), { status: 200, headers: { "Content-Type": "text/event-stream" } })
}

describe("parseSseChunk", () => {
  it("parses complete messages and keeps the tail", () => {
    const result = parseSseChunk('event: storage\ndata: {"id":"a"}\n\nevent: file\ndata: {"pa')
    expect(result.messages).toEqual([{ event: "storage", data: '{"id":"a"}' }])
    expect(result.rest).toBe('event: file\ndata: {"pa')
  })

  it("ignores comments and heartbeats", () => {
    const result = parseSseChunk(": connected\n\n: heartbeat 2026-11-15T00:00:00Z\n\n")
    expect(result.messages).toEqual([])
    expect(result.rest).toBe("")
  })

  it("joins multi-line data, reads id, and defaults the event name", () => {
    const result = parseSseChunk("id: 7\ndata: line1\ndata:line2\n\n")
    expect(result.messages).toEqual([{ event: "message", data: "line1\nline2", id: "7" }])
  })

  it("accepts CRLF and CR line endings", () => {
    expect(parseSseChunk("event: file\r\ndata: {}\r\n\r\n").messages).toEqual([{ event: "file", data: "{}" }])
    expect(parseSseChunk("event: file\rdata: {}\r\rdata: next")).toEqual({
      messages: [{ event: "file", data: "{}" }],
      rest: "data: next",
    })
  })

  it("holds back a trailing CR that may start a CRLF pair", () => {
    const first = parseSseChunk("event: file\r\ndata: {}\r\n\r")
    expect(first.messages).toEqual([])
    expect(first.rest.endsWith("\r")).toBe(true)
    const second = parseSseChunk(`${first.rest}\n`)
    expect(second.messages).toEqual([{ event: "file", data: "{}" }])
  })

  it("drops blocks without data and handles fields without a colon", () => {
    expect(parseSseChunk("event: storage\n\n").messages).toEqual([])
    expect(parseSseChunk("event\ndata\n\n").messages).toEqual([{ event: "message", data: "" }])
    expect(parseSseChunk("retry: 10\nid: 1\n\n").messages).toEqual([])
  })

  it("returns everything as rest when no message is complete", () => {
    expect(parseSseChunk("")).toEqual({ messages: [], rest: "" })
    expect(parseSseChunk("data: x\n")).toEqual({ messages: [], rest: "data: x\n" })
  })
})

describe("backoffDelay", () => {
  it("doubles from the minimum and caps at the maximum", () => {
    expect(backoffDelay(0)).toBe(SSE_MIN_DELAY_MS)
    expect(backoffDelay(1)).toBe(SSE_MIN_DELAY_MS * 2)
    expect(backoffDelay(3, 100, 1000)).toBe(800)
    expect(backoffDelay(10)).toBe(SSE_MAX_DELAY_MS)
  })

  it("treats negative attempts as the first", () => {
    expect(backoffDelay(-2, 100, 1000)).toBe(100)
  })
})

describe("dispatchSseMessage", () => {
  it("routes storage, file and run events with parsed payloads", () => {
    const handlers = { onStorage: vi.fn(), onFile: vi.fn(), onRunEvent: vi.fn() }
    dispatchSseMessage({ event: "storage", data: '{"type":"run","id":"r","action":"put"}' }, handlers)
    dispatchSseMessage({ event: "file", data: '{"path":"/a","executionPath":"/a"}' }, handlers)
    dispatchSseMessage({ event: "run", data: '{"seq":1,"type":"run.start","at":"t","data":{}}' }, handlers)
    expect(handlers.onStorage).toHaveBeenCalledWith({ type: "run", id: "r", action: "put" })
    expect(handlers.onFile).toHaveBeenCalledWith({ path: "/a", executionPath: "/a" })
    expect(handlers.onRunEvent).toHaveBeenCalledWith({ seq: 1, type: "run.start", at: "t", data: {} })
  })

  it("ignores unknown events and events without a handler", () => {
    const onError = vi.fn()
    dispatchSseMessage({ event: "message", data: "not json" }, { onError })
    dispatchSseMessage({ event: "storage", data: "not json" }, { onError })
    expect(onError).not.toHaveBeenCalled()
  })

  it("reports invalid JSON payloads", () => {
    const handlers = { onStorage: vi.fn(), onError: vi.fn() }
    dispatchSseMessage({ event: "storage", data: "{bad" }, handlers)
    expect(handlers.onStorage).not.toHaveBeenCalled()
    expect(handlers.onError).toHaveBeenCalledWith(expect.any(SyntaxError))
  })
})

describe("watchSse", () => {
  it("sends the bearer header and delivers events split across chunks", async () => {
    const controller = new AbortController()
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetch: FetchLike = async (url, init) => {
      calls.push({ url, init })
      return sseResponse([": connected\n\nevent: sto", 'rage\ndata: {"type":"execution","id":"e","action":"put"}\n\n'])
    }
    const onStorage = vi.fn(() => controller.abort())
    const onOpen = vi.fn()
    await watchSse("http://h/v1/watch", "tok", { onStorage, onOpen }, controller.signal, { fetch, minDelayMs: 1 })
    expect(onOpen).toHaveBeenCalledWith(false)
    expect(onStorage).toHaveBeenCalledWith({ type: "execution", id: "e", action: "put" })
    expect(calls).toHaveLength(1)
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer tok")
    expect(headers.Accept).toBe("text/event-stream")
    expect(calls[0]?.init?.signal).toBe(controller.signal)
  })

  it("reconnects with backoff after drops, errors and bad statuses", async () => {
    const controller = new AbortController()
    let call = 0
    const fetch: FetchLike = async () => {
      call += 1
      if (call === 1) return sseResponse([])
      if (call === 2) throw new Error("network down")
      if (call === 3) return new Response("no", { status: 503 })
      if (call === 4) return new Response(null, { status: 200 })
      return sseResponse(['event: file\ndata: {"path":"/a","executionPath":"/a"}\n\n'])
    }
    const opens: boolean[] = []
    const errors: string[] = []
    const handlers: SseHandlers = {
      onOpen: (reconnected) => opens.push(reconnected),
      onError: (error) => errors.push((error as Error).message),
      onFile: () => controller.abort(),
    }
    await watchSse("http://h/v1/watch", "tok", handlers, controller.signal, { fetch, minDelayMs: 1, maxDelayMs: 2 })
    expect(call).toBe(5)
    expect(opens).toEqual([false, true])
    expect(errors).toEqual([
      "network down",
      "Watch stream answered HTTP 503.",
      "Watch stream answered HTTP 200.",
    ])
  })

  it("stops on 401 without reconnecting", async () => {
    const fetch = vi.fn<FetchLike>(async () => new Response("", { status: 401 }))
    const onUnauthorized = vi.fn()
    await watchSse("http://h/v1/watch", "bad", { onUnauthorized }, new AbortController().signal, { fetch })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it("stops on 401 with no handler set", async () => {
    const fetch = vi.fn<FetchLike>(async () => new Response("", { status: 401 }))
    await expect(watchSse("http://h/v1/watch", "bad", {}, new AbortController().signal, { fetch })).resolves.toBeUndefined()
  })

  it("does nothing when already aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    const fetch = vi.fn<FetchLike>()
    await watchSse("http://h/v1/watch", "tok", {}, controller.signal, { fetch })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("stops quietly when aborted during the request", async () => {
    const controller = new AbortController()
    const onError = vi.fn()
    const fetch: FetchLike = async () => {
      controller.abort()
      throw new DOMException("aborted", "AbortError")
    }
    await watchSse("http://h/v1/watch", "tok", { onError }, controller.signal, { fetch })
    expect(onError).not.toHaveBeenCalled()
  })

  it("stops when aborted after the stream closes", async () => {
    const controller = new AbortController()
    const fetch = vi.fn<FetchLike>(async () => {
      controller.abort()
      return sseResponse([])
    })
    await watchSse("http://h/v1/watch", "tok", {}, controller.signal, { fetch })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("wakes from the backoff sleep when aborted", async () => {
    const controller = new AbortController()
    const fetch = vi.fn<FetchLike>(async () => {
      throw new Error("down")
    })
    const started = Date.now()
    const watching = watchSse("http://h/v1/watch", "tok", {}, controller.signal, {
      fetch,
      minDelayMs: 60_000,
      maxDelayMs: 60_000,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()
    await watching
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("uses the global fetch by default", async () => {
    const controller = new AbortController()
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      controller.abort()
      return sseResponse([])
    })
    try {
      await watchSse("http://h/v1/watch", "tok", {}, controller.signal)
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      spy.mockRestore()
    }
  })
})
