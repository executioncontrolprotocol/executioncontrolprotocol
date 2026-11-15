import { describe, expect, it, vi } from "vitest"
import { extractAdobeStatusUrl, pollAdobeJob } from "../src/http/async-job.js"
import type { AdobeHttpClient, AdobeRequestOptions } from "../src/http/client.js"
import { sleep, raceSignal } from "../src/runtime/abort.js"

const STATUS_URL = "https://firefly-api.adobe.io/v3/status/job-1?token=abc"

function scriptedClient(...bodies: unknown[]): AdobeHttpClient & { calls: AdobeRequestOptions[] } {
  const calls: AdobeRequestOptions[] = []
  const queue = [...bodies]
  return {
    calls,
    async request(options) {
      calls.push(options)
      if (queue.length === 0) throw new Error("no more scripted responses")
      return queue.length === 1 ? queue[0] : queue.shift()
    },
  }
}

describe("extractAdobeStatusUrl", () => {
  it("reads statusUrl, statusURL, a URL-valued status and Substance's url", () => {
    expect(extractAdobeStatusUrl({ statusUrl: "https://a.test/s" })).toBe("https://a.test/s")
    expect(extractAdobeStatusUrl({ statusURL: "https://a.test/S" })).toBe("https://a.test/S")
    expect(extractAdobeStatusUrl({ status: "https://a.test/x" })).toBe("https://a.test/x")
    expect(extractAdobeStatusUrl({ id: "j", url: "http://a.test/u" })).toBe("http://a.test/u")
  })

  it("reads HAL _links.self and named links in priority order", () => {
    expect(extractAdobeStatusUrl({ _links: { self: { href: "https://a.test/hal" } } })).toBe("https://a.test/hal")
    expect(
      extractAdobeStatusUrl({ links: { self: { href: "https://a.test/self" }, status: { href: "https://a.test/status" } } }),
    ).toBe("https://a.test/status")
  })

  it("prefers a Firefly link typed result, then any link with an href", () => {
    expect(
      extractAdobeStatusUrl({
        links: { cancel: { href: "https://a.test/cancel" }, poll: { href: "https://a.test/poll", type: "result" } },
      }),
    ).toBe("https://a.test/poll")
    expect(extractAdobeStatusUrl({ links: { other: null, cancel: { href: "https://a.test/cancel" } } })).toBe(
      "https://a.test/cancel",
    )
  })

  it("returns undefined for non-objects, relative URLs and plain statuses", () => {
    expect(extractAdobeStatusUrl(undefined)).toBeUndefined()
    expect(extractAdobeStatusUrl([{ statusUrl: "https://a.test" }])).toBeUndefined()
    expect(extractAdobeStatusUrl({ status: "running", statusUrl: "/v3/status/1" })).toBeUndefined()
    expect(extractAdobeStatusUrl({ links: "nope" })).toBeUndefined()
    expect(extractAdobeStatusUrl({ links: { a: { href: 5 } } })).toBeUndefined()
  })
})

describe("pollAdobeJob", () => {
  it("polls until the job succeeds and returns the final body", async () => {
    const final = { jobId: "job-1", status: "SUCCEEDED", result: { outputs: [] } }
    const client = scriptedClient({ status: "pending" }, { status: "running" }, {}, final)
    await expect(pollAdobeJob({ statusUrl: STATUS_URL, client, intervalMs: 1 })).resolves.toEqual(final)
    expect(client.calls).toHaveLength(4)
    expect(client.calls.every((c) => c.method === "GET" && c.url === STATUS_URL)).toBe(true)
  })

  it.each(["succeeded", "completed", "done", "partially_succeeded", "success"])("treats %s as success", async (status) => {
    await expect(pollAdobeJob({ statusUrl: STATUS_URL, client: scriptedClient({ status }) })).resolves.toEqual({ status })
  })

  it("fails with the job's error fields when the job fails, without leaking the status URL query", async () => {
    const client = scriptedClient({
      status: "failed",
      error_code: "x",
      errors: [{ code: "input_invalid", title: "Bad PSD" }],
      result: { error: "inner" },
      outputs: ["https://secret.example/presigned?sig=1"],
    })
    await expect(pollAdobeJob({ statusUrl: STATUS_URL, client })).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      message: "Adobe job ended with status failed.",
      details: {
        status: "failed",
        statusUrl: "https://firefly-api.adobe.io/v3/status/job-1",
        errors: [{ code: "input_invalid", title: "Bad PSD" }],
        resultErrors: "inner",
      },
    })
    const error = await pollAdobeJob({ statusUrl: STATUS_URL, client }).catch((e: { details: object }) => e)
    expect(JSON.stringify(error.details)).not.toContain("presigned")
  })

  it("times out with the last seen status", async () => {
    let now = 0
    const client = scriptedClient({ status: "running" })
    await expect(
      pollAdobeJob({ statusUrl: STATUS_URL, client, intervalMs: 1, timeoutMs: 5, now: () => (now += 3) }),
    ).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      message: "Adobe job did not finish within 5 ms.",
      details: { timeoutMs: 5, lastStatus: "running" },
    })
  })

  it("times out without a lastStatus when the job never reports one", async () => {
    const client = scriptedClient("not-an-object")
    const error = await pollAdobeJob({ statusUrl: STATUS_URL, client, intervalMs: 10, timeoutMs: 1 }).catch(
      (e: { details: Record<string, unknown> }) => e,
    )
    expect(error.details).not.toHaveProperty("lastStatus")
  })

  it("stops mid-poll when the signal aborts during the wait", async () => {
    const controller = new AbortController()
    const client = scriptedClient({ status: "running" })
    const pending = pollAdobeJob({ statusUrl: STATUS_URL, client, intervalMs: 60_000, signal: controller.signal })
    await vi.waitFor(() => expect(client.calls).toHaveLength(1))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(client.calls[0]!.signal).toBe(controller.signal)
  })

  it("does not poll at all when the signal is already aborted", async () => {
    const controller = new AbortController()
    controller.abort(new Error("cancelled by run"))
    const client = scriptedClient({ status: "succeeded" })
    await expect(pollAdobeJob({ statusUrl: STATUS_URL, client, signal: controller.signal })).rejects.toThrow("cancelled by run")
    expect(client.calls).toHaveLength(0)
  })
})

describe("abort helpers", () => {
  it("sleep resolves after the delay and rejects on abort", async () => {
    await expect(sleep(1)).resolves.toBeUndefined()
    const controller = new AbortController()
    controller.abort()
    await expect(sleep(1, controller.signal)).rejects.toMatchObject({ name: "AbortError" })
  })

  it("raceSignal passes through values and errors", async () => {
    await expect(raceSignal(Promise.resolve(1))).resolves.toBe(1)
    const signal = new AbortController().signal
    await expect(raceSignal(Promise.resolve(2), signal)).resolves.toBe(2)
    await expect(raceSignal(Promise.reject(new Error("boom")), signal)).rejects.toThrow("boom")
  })
})
