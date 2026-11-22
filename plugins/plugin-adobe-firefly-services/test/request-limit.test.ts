import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearImsTokenCache } from "../src/auth/ims.js"
import { resolveAdobeConfig } from "../src/config.js"
import { createAdobeHttpClient } from "../src/http/client.js"
import {
  createRequestLimiter,
  resetSharedRequestLimiters,
  sharedRequestLimiter,
  type RequestLimiter,
  type RequestLimiterClock,
} from "../src/http/request-limit.js"
import { generatedCapabilities } from "../src/generated/index.js"
import { CONFIG, jsonResponse, makeCtx, stubFetch } from "./helpers.js"

/** Manual clock: sleeping advances time instantly and records the wait. */
function manualClock(): RequestLimiterClock & { waits: number[]; time: number } {
  const clock = {
    time: 1_000,
    waits: [] as number[],
    now: () => clock.time,
    async sleep(ms: number, signal?: AbortSignal) {
      signal?.throwIfAborted()
      clock.waits.push(ms)
      clock.time += ms
    },
  }
  return clock
}

/** Records the order in which requests are let through. */
function recordingLimiter(): RequestLimiter & { count: number } {
  const limiter = {
    count: 0,
    async acquire() {
      limiter.count += 1
    },
  }
  return limiter
}

beforeEach(() => {
  clearImsTokenCache()
  resetSharedRequestLimiters()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("createRequestLimiter", () => {
  it("lets the first request start at once and spaces the next ones evenly", async () => {
    const clock = manualClock()
    const limiter = createRequestLimiter(4, clock)
    await limiter.acquire()
    await limiter.acquire()
    await limiter.acquire()
    expect(clock.waits).toEqual([15_000, 15_000])
  })

  it("does not wait when requests are already further apart than the spacing", async () => {
    const clock = manualClock()
    const limiter = createRequestLimiter(60, clock)
    await limiter.acquire()
    clock.time += 5_000
    await limiter.acquire()
    expect(clock.waits).toEqual([])
  })

  it("queues concurrent callers in call order", async () => {
    vi.useFakeTimers()
    const limiter = createRequestLimiter(60)
    const started: number[] = []
    const all = [0, 1, 2].map((n) => limiter.acquire().then(() => started.push(n)))
    await vi.advanceTimersByTimeAsync(0)
    expect(started).toEqual([0])
    await vi.advanceTimersByTimeAsync(1_000)
    expect(started).toEqual([0, 1])
    await vi.advanceTimersByTimeAsync(1_000)
    await Promise.all(all)
    expect(started).toEqual([0, 1, 2])
  })

  it("rejects with the abort reason while waiting, and before waiting when already aborted", async () => {
    vi.useFakeTimers()
    const limiter = createRequestLimiter(1)
    await limiter.acquire()
    const controller = new AbortController()
    const waiting = limiter.acquire(controller.signal)
    controller.abort()
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" })
    await expect(limiter.acquire(controller.signal)).rejects.toMatchObject({ name: "AbortError" })
  })
})

describe("sharedRequestLimiter", () => {
  it("shares one limiter per client id, endpoint and limit", () => {
    const a = sharedRequestLimiter({ clientId: "c", maxRequestsPerMinute: 4 })
    expect(sharedRequestLimiter({ clientId: "c", maxRequestsPerMinute: 4 })).toBe(a)
    expect(sharedRequestLimiter({ clientId: "c", maxRequestsPerMinute: 5 })).not.toBe(a)
    expect(sharedRequestLimiter({ clientId: "d", maxRequestsPerMinute: 4 })).not.toBe(a)
    expect(sharedRequestLimiter({ clientId: "c", baseUrl: "https://mock.test", maxRequestsPerMinute: 4 })).not.toBe(a)
  })
})

describe("client with a limiter", () => {
  function client(fetchImpl: typeof fetch, limiter: RequestLimiter) {
    return createAdobeHttpClient({ clientId: "c", getAccessToken: async () => "t", fetchImpl, retryBaseMs: 1, limiter })
  }

  it("takes a slot for each non-GET attempt, including a retry after 429, and none for GET", async () => {
    const limiter = recordingLimiter()
    const responses = [jsonResponse(429, {}), jsonResponse(200, { ok: 1 }), jsonResponse(200, { status: "running" })]
    const fetchImpl = vi.fn(async () => responses.shift()!) as unknown as typeof fetch
    const c = client(fetchImpl, limiter)
    await c.request({ method: "POST", url: "https://api.test/submit" })
    expect(limiter.count).toBe(2)
    await c.request({ method: "GET", url: "https://api.test/status" })
    expect(limiter.count).toBe(2)
  })

  it("does not send the request when the wait is aborted", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const limiter: RequestLimiter = { acquire: async () => Promise.reject(new DOMException("stop", "AbortError")) }
    await expect(client(fetchImpl, limiter).request({ method: "POST", url: "https://api.test/x" })).rejects.toMatchObject({
      name: "AbortError",
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe("maxRequestsPerMinute config", () => {
  it("accepts a positive integer and rejects zero, fractions and absurd values", () => {
    expect(resolveAdobeConfig({ ...CONFIG, maxRequestsPerMinute: 4 }).maxRequestsPerMinute).toBe(4)
    for (const bad of [0, 1.5, 100_001]) {
      expect(() => resolveAdobeConfig({ ...CONFIG, maxRequestsPerMinute: bad })).toThrow()
    }
  })

  it("spaces job submissions across handler calls that share the config, without delaying polls", async () => {
    vi.useFakeTimers()
    const statusUrl = "https://firefly-api.adobe.io/v3/status/job-1"
    const submits: number[] = []
    stubFetch((call) => {
      if (call.method === "POST") {
        submits.push(Date.now())
        return jsonResponse(202, { jobId: "job-1", statusUrl })
      }
      return jsonResponse(200, { status: "succeeded", result: { outputs: [] } })
    })
    const handler = (await generatedCapabilities["firefly-generate-images-v3-async"].handler()).default
    const config = { ...CONFIG, maxRequestsPerMinute: 2 }
    const both = Promise.all([handler({ prompt: "a" }, makeCtx(config)), handler({ prompt: "b" }, makeCtx(config))])
    await vi.advanceTimersByTimeAsync(30_000)
    await both
    expect(submits).toHaveLength(2)
    expect(submits[1]! - submits[0]!).toBe(30_000)
  })

  it("adds no delay when the limit is omitted", async () => {
    vi.useFakeTimers()
    const submits: number[] = []
    const fetchCalls = stubFetch((call) => {
      if (call.method === "POST") {
        submits.push(Date.now())
        return jsonResponse(202, { jobId: "j", statusUrl: "https://firefly-api.adobe.io/v3/status/j" })
      }
      return jsonResponse(200, { status: "succeeded", result: { outputs: [] } })
    })
    const handler = (await generatedCapabilities["firefly-generate-images-v3-async"].handler()).default
    await Promise.all([handler({ prompt: "a" }, makeCtx(CONFIG)), handler({ prompt: "b" }, makeCtx(CONFIG))])
    expect(fetchCalls.calls.filter((c) => c.method === "POST")).toHaveLength(2)
    expect(new Set(submits).size).toBe(1)
  })
})
