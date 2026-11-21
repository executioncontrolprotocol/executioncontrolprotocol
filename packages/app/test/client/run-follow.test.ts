import type { RunDetail, RunEvent } from "@executioncontrolprotocol/protocol"
import { describe, expect, it, vi } from "vitest"
import { VERSION } from "../../src/index.js"
import { AppHostClient, HostRequestError, type FetchLike } from "../../src/client/api.js"
import { followRun } from "../../src/client/run-follow.js"

const BASE = "http://127.0.0.1:4000"
const RUN_ID = "run-20261115T000000Z-abcdef"

function event(seq: number, type: RunEvent["type"], data: Record<string, unknown> = {}): RunEvent {
  return { seq, type, at: "t", data }
}

function detail(status: RunDetail["status"], events: RunEvent[]): RunDetail {
  return {
    schema: "@executioncontrolprotocol.run",
    version: "1.0",
    id: RUN_ID,
    execution: { path: "/w/a.ecp.json", manifestHash: "h" },
    status,
    input: {},
    result: status === "completed" ? { out: 1 } : null,
    error: null,
    startedAt: "t",
    plugins: {},
    host: { version: VERSION, pid: 1, mode: "in-process" },
    warnings: [],
    publishes: [],
    events,
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

function openSse(chunks: string[], signal: AbortSignal | null | undefined): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      signal?.addEventListener("abort", () => {
        try {
          controller.error(new DOMException("aborted", "AbortError"))
        } catch {
          // already closed
        }
      })
    },
  })
  return new Response(body, { status: 200 })
}

interface HostScript {
  watch?: (init?: RequestInit) => Response
  retrieve: (count: number, body: unknown) => Response | Promise<Response>
}

function host(script: HostScript): { client: AppHostClient; retrieveBodies: unknown[]; watchUrls: string[] } {
  const retrieveBodies: unknown[] = []
  const watchUrls: string[] = []
  const fetch: FetchLike = async (url, init) => {
    if (url.includes("/v1/watch")) {
      watchUrls.push(url)
      return script.watch ? script.watch(init) : openSse([": connected\n\n"], init?.signal)
    }
    const body = JSON.parse(String(init?.body)) as unknown
    retrieveBodies.push(body)
    return script.retrieve(retrieveBodies.length, body)
  }
  return { client: new AppHostClient(BASE, "tok", { fetch }), retrieveBodies, watchUrls }
}

describe("followRun", () => {
  it("delivers each event once, in order, then the final detail", async () => {
    const snapshots = [
      detail("running", [event(1, "run.start"), event(2, "step.start", { nodeId: "a" })]),
      detail("running", [event(2, "step.start", { nodeId: "a" }), event(1, "run.start")]),
      detail("completed", [
        event(1, "run.start"),
        event(2, "step.start", { nodeId: "a" }),
        event(3, "step.end", { nodeId: "a" }),
        event(4, "run.end", { status: "completed" }),
      ]),
    ]
    const { client, retrieveBodies, watchUrls } = host({
      retrieve: (count) => json(200, { ok: true, data: { type: "run", item: snapshots[Math.min(count, 3) - 1] } }),
    })
    const seen: number[] = []
    const onDone = vi.fn()
    await followRun(client, RUN_ID, { onEvent: (e) => seen.push(e.seq), onDone }, new AbortController().signal, {
      pollMs: 5,
    })
    expect(seen).toEqual([1, 2, 3, 4])
    expect(onDone).toHaveBeenCalledTimes(1)
    expect((onDone.mock.calls[0]?.[0] as RunDetail).result).toEqual({ out: 1 })
    expect(retrieveBodies[0]).toEqual({ type: "run", id: RUN_ID, include: ["events"] })
    expect(watchUrls[0]).toBe(`${BASE}/v1/watch?types=run&runId=${RUN_ID}`)
  })

  it("refreshes on storage and run notifications from the watch stream", async () => {
    let calls = 0
    const { client } = host({
      watch: (init) =>
        openSse(
          [
            'event: storage\ndata: {"type":"run","id":"x","action":"put"}\n\n',
            'event: run\ndata: {"seq":9,"type":"run.end","at":"t","data":{}}\n\n',
          ],
          init?.signal,
        ),
      retrieve: () => {
        calls += 1
        const status = calls >= 2 ? "failed" : "running"
        return json(200, { ok: true, data: { type: "run", item: detail(status, [event(1, "run.start")]) } })
      },
    })
    const onDone = vi.fn()
    await followRun(client, RUN_ID, { onEvent: () => undefined, onDone }, new AbortController().signal, {
      pollMs: 60_000,
    })
    expect(calls).toBe(2)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("reports refusals and keeps following", async () => {
    const { client } = host({
      retrieve: (count) =>
        count === 1
          ? json(404, { ok: false, error: { code: "ECP_NOT_FOUND", message: "not yet" } })
          : json(200, { ok: true, data: { type: "run", item: detail("completed", []) } }),
    })
    const onError = vi.fn()
    const onDone = vi.fn()
    await followRun(client, RUN_ID, { onEvent: () => undefined, onDone, onError }, new AbortController().signal, {
      pollMs: 5,
    })
    expect(onError).toHaveBeenCalledWith(expect.any(HostRequestError))
    expect((onError.mock.calls[0]?.[0] as HostRequestError).code).toBe("ECP_NOT_FOUND")
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("reports thrown request errors and keeps following", async () => {
    let calls = 0
    const fetch: FetchLike = async (url, init) => {
      if (url.includes("/v1/watch")) return openSse([], init?.signal)
      calls += 1
      if (calls === 1) throw new Error("socket closed")
      return json(200, { ok: true, data: { type: "run", item: detail("cancelled", []) } })
    }
    const onError = vi.fn()
    const onDone = vi.fn()
    await followRun(
      new AppHostClient(BASE, "tok", { fetch }),
      RUN_ID,
      { onEvent: () => undefined, onDone, onError },
      new AbortController().signal,
      { pollMs: 5 },
    )
    expect((onError.mock.calls[0]?.[0] as HostRequestError).code).toBe("ECP_HOST_UNAVAILABLE")
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("ignores list-shaped responses", async () => {
    const { client } = host({
      retrieve: (count) =>
        count === 1
          ? json(200, { ok: true, data: { type: "run", items: [], total: 0 } })
          : json(200, { ok: true, data: { type: "run", item: detail("completed", []) } }),
    })
    const onDone = vi.fn()
    await followRun(client, RUN_ID, { onEvent: () => undefined, onDone }, new AbortController().signal, { pollMs: 5 })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("stops when the token is rejected by retrieve", async () => {
    const { client } = host({
      retrieve: () => json(401, { ok: false, error: { code: "ECP_UNAUTHORIZED", message: "no" } }),
    })
    const onUnauthorized = vi.fn()
    const onDone = vi.fn()
    await followRun(client, RUN_ID, { onEvent: () => undefined, onDone, onUnauthorized }, new AbortController().signal, {
      pollMs: 5,
    })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
  })

  it("stops when the token is rejected by the watch stream", async () => {
    const { client } = host({
      watch: () => new Response("", { status: 401 }),
      retrieve: () => new Promise<Response>(() => undefined),
    })
    const onUnauthorized = vi.fn()
    await followRun(client, RUN_ID, { onEvent: () => undefined, onDone: () => undefined, onUnauthorized }, new AbortController().signal, {
      pollMs: 60_000,
    })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it("stops without callbacks when the caller aborts", async () => {
    const controller = new AbortController()
    const { client } = host({
      retrieve: () => json(200, { ok: true, data: { type: "run", item: detail("running", [event(1, "run.start")]) } }),
    })
    const onEvent = vi.fn(() => controller.abort())
    const onDone = vi.fn()
    const onError = vi.fn()
    await followRun(client, RUN_ID, { onEvent, onDone, onError }, controller.signal, { pollMs: 5 })
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it("drops responses that arrive after an abort", async () => {
    const controller = new AbortController()
    let release: (() => void) | undefined
    const { client } = host({
      retrieve: () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(json(200, { ok: true, data: { type: "run", item: detail("completed", []) } }))
        }),
    })
    const onDone = vi.fn()
    const following = followRun(client, RUN_ID, { onEvent: () => undefined, onDone }, controller.signal, { pollMs: 5 })
    await vi.waitFor(() => expect(release).toBeDefined())
    controller.abort()
    await following
    release?.()
    expect(onDone).not.toHaveBeenCalled()
  })

  it("uses default options and tolerates a detail without events", async () => {
    const { client } = host({
      retrieve: () => {
        const bare: Partial<RunDetail> = detail("interrupted", [])
        delete bare.events
        return json(200, { ok: true, data: { type: "run", item: bare } })
      },
    })
    const onEvent = vi.fn()
    const onDone = vi.fn()
    await followRun(client, RUN_ID, { onEvent, onDone }, new AbortController().signal)
    expect(onEvent).not.toHaveBeenCalled()
    expect((onDone.mock.calls[0]?.[0] as RunDetail).status).toBe("interrupted")
  })

  it("returns at once when the signal is already aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    const fetch = vi.fn<FetchLike>()
    await followRun(new AppHostClient(BASE, "tok", { fetch }), RUN_ID, { onEvent: vi.fn(), onDone: vi.fn() }, controller.signal)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("queues one refresh while a request is in flight instead of overlapping", async () => {
    let active = 0
    let maxActive = 0
    let calls = 0
    let releaseFirstRetrieve: (() => void) | undefined
    const { client } = host({
      retrieve: async () => {
        calls += 1
        active += 1
        maxActive = Math.max(maxActive, active)
        if (calls === 1) {
          await new Promise<void>((resolve) => {
            releaseFirstRetrieve = resolve
          })
        }
        active -= 1
        const status = calls >= 3 ? "completed" : "running"
        return json(200, { ok: true, data: { type: "run", item: detail(status, [event(1, "run.start")]) } })
      },
    })
    const seen: number[] = []
    const following = followRun(client, RUN_ID, { onEvent: (e) => seen.push(e.seq), onDone: () => undefined }, new AbortController().signal, {
      pollMs: 2,
    })
    await vi.waitFor(() => expect(calls).toBeGreaterThanOrEqual(1))
    let pollTicks = 0
    await vi.waitFor(() => {
      pollTicks += 1
      return pollTicks >= 3
    }, { interval: 3, timeout: 100 })
    releaseFirstRetrieve?.()
    await following
    expect(maxActive).toBe(1)
    expect(seen).toEqual([1])
  })
})
