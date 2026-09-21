import { describe, expect, it, vi } from "vitest"
import { AdobeHttpError, buildUrl, createAdobeHttpClient } from "../src/http/client.js"
import { extractAdobeStatusUrl, pollAdobeJob } from "../src/http/async-job.js"
import {
  collectManifestDestinationUrls,
  extractEmbeddedManifestJson,
  materializePhotoshopManifest,
  photoshopManifestDocumentSchema,
} from "../src/runtime/photoshop-manifest.js"

describe("Adobe HTTP client", () => {
  it("buildUrl substitutes path and query params", () => {
    const url = buildUrl(
      "https://example.adobe.io/",
      "/v2/status/{jobId}",
      { jobId: "abc/def" },
      { wait: true, skip: undefined },
    )
    expect(url).toBe("https://example.adobe.io/v2/status/abc%2Fdef?wait=true")
  })

  it("sends Bearer and x-api-key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    const client = createAdobeHttpClient({
      clientId: "cid",
      getAccessToken: async () => "bearer-tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(
      client.request({ method: "GET", url: "https://example.adobe.io/ping" }),
    ).resolves.toEqual({ ok: true })
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer bearer-tok")
    expect(headers["x-api-key"]).toBe("cid")
  })

  it("throws AdobeHttpError on non-2xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("bad", { status: 500 }))
    const client = createAdobeHttpClient({
      clientId: "cid",
      getAccessToken: async () => "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(
      client.request({ method: "GET", url: "https://example.adobe.io/x" }),
    ).rejects.toBeInstanceOf(AdobeHttpError)
  })
})

describe("extractAdobeStatusUrl", () => {
  it("reads statusUrl, links.status, and substance url", () => {
    expect(extractAdobeStatusUrl({ statusUrl: "https://a.example/s" })).toBe("https://a.example/s")
    expect(
      extractAdobeStatusUrl({ links: { status: { href: "https://b.example/s" } } }),
    ).toBe("https://b.example/s")
    expect(extractAdobeStatusUrl({ url: "https://c.example/job" })).toBe("https://c.example/job")
    expect(
      extractAdobeStatusUrl({
        links: { result: { href: "https://d.example/r", type: "result" } },
      }),
    ).toBe("https://d.example/r")
  })
})

describe("pollAdobeJob", () => {
  it("returns when status succeeds", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ status: "running" })
      .mockResolvedValueOnce({ status: "succeeded", jobId: "j1" })
    const result = await pollAdobeJob({
      statusUrl: "https://example.adobe.io/status/j1",
      client: { request },
      intervalMs: 1,
      timeoutMs: 5_000,
    })
    expect(result).toEqual({ status: "succeeded", jobId: "j1" })
    expect(request).toHaveBeenCalledTimes(2)
  })
})

describe("photoshop manifest materialize", () => {
  it("parses destination URLs and embedded job JSON", () => {
    expect(
      collectManifestDestinationUrls({
        outputs: [{ destination: { url: "https://blob.example/m.json" } }],
      }),
    ).toEqual(["https://blob.example/m.json"])
    expect(
      extractEmbeddedManifestJson({
        result: { layers: [{ id: 1, name: "A" }] },
      }),
    ).toEqual({ layers: [{ id: 1, name: "A" }] })
  })

  it("downloads manifest JSON from destination when not embedded", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ layers: [{ id: 42, name: "Text" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    const doc = await materializePhotoshopManifest({
      jobStatus: { status: "succeeded", jobId: "j1" },
      requestBody: {
        outputs: [{ destination: { url: "https://blob.example/m.json" } }],
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(doc).toEqual({ layers: [{ id: 42, name: "Text" }] })
    expect(photoshopManifestDocumentSchema.safeParse(doc).success).toBe(true)
  })
})
