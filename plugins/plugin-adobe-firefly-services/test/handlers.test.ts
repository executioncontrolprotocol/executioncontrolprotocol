import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearImsTokenCache } from "../src/auth/ims.js"
import { generatedCapabilities } from "../src/generated/index.js"
import { load as loadFirefly } from "../src/generated/firefly/operations.js"
import { CONFIG, hangUntilAborted, jsonResponse, makeCtx, stubFetch, tokenResponse } from "./helpers.js"

type CapabilityName = keyof typeof generatedCapabilities

async function handlerFor(name: CapabilityName) {
  return (await generatedCapabilities[name].handler()).default
}

const FIREFLY = "https://firefly-api.adobe.io"
const PHOTOSHOP = "https://photoshop-api.adobe.io"

beforeEach(() => {
  clearImsTokenCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("sync capability: firefly-get-custom-models", () => {
  it("sends query and header parameters with IMS auth and returns the response", async () => {
    const listing = { custom_models: [{ assetId: "m1", displayName: "Brand" }], total_count: 1 }
    const { calls, imsCalls } = stubFetch(() => jsonResponse(200, listing))
    const handler = await handlerFor("firefly-get-custom-models")

    const result = await handler({ "x-request-id": "req-1", sortBy: "createdDate", limit: "5" }, makeCtx(CONFIG))

    expect(result).toEqual(listing)
    expect(imsCalls).toHaveLength(1)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: `${FIREFLY}/v3/custom-models?sortBy=createdDate&limit=5`,
      body: undefined,
      headers: { authorization: "Bearer token-1", "x-api-key": "client-id", "x-request-id": "req-1" },
    })
  })

  it("returns an empty object for an empty success body", async () => {
    stubFetch(() => new Response("", { status: 200 }))
    const handler = await handlerFor("firefly-get-custom-models")
    await expect(handler({ "x-request-id": "r" }, makeCtx(CONFIG))).resolves.toEqual({})
  })

  it("reuses the cached IMS token across calls (warm host)", async () => {
    const { imsCalls } = stubFetch(() => jsonResponse(200, {}))
    const handler = await handlerFor("firefly-get-custom-models")
    await handler({ "x-request-id": "a" }, makeCtx(CONFIG))
    await handler({ "x-request-id": "b" }, makeCtx({ ...CONFIG }))
    expect(imsCalls).toHaveLength(1)
  })

  it("maps an API error to ECP_PROVIDER_ERROR", async () => {
    stubFetch(() => jsonResponse(403, { error_code: "access_denied" }))
    const handler = await handlerFor("firefly-get-custom-models")
    await expect(handler({ "x-request-id": "r" }, makeCtx(CONFIG))).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      details: { status: 403, body: { error_code: "access_denied" } },
    })
  })

  it("maps an IMS failure to ECP_PROVIDER_ERROR before calling the API", async () => {
    const { calls } = stubFetch(
      () => jsonResponse(200, {}),
      () => jsonResponse(400, { error: "invalid_scope" }),
    )
    const handler = await handlerFor("firefly-get-custom-models")
    await expect(handler({ "x-request-id": "r" }, makeCtx(CONFIG))).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      details: { status: 400, body: { error: "invalid_scope" } },
    })
    expect(calls).toHaveLength(0)
  })
})

describe("async capability: firefly-generate-images-v3-async", () => {
  const statusUrl = `${FIREFLY}/v3/status/job-1`

  function fireflyRoute(final: unknown, polls: unknown[] = [{ status: "running" }]) {
    const queue = [...polls, final]
    return stubFetch((call) => {
      if (call.method === "POST") return jsonResponse(202, { jobId: "job-1", statusUrl, cancelUrl: `${FIREFLY}/v3/cancel/job-1` })
      return jsonResponse(200, queue.length > 1 ? queue.shift() : queue[0])
    })
  }

  it("submits the merged body, polls the status URL and returns the unwrapped result", async () => {
    const outputs = [{ seed: 1, image: { url: "https://cdn.test/out.png" } }]
    const { calls } = fireflyRoute({ jobId: "job-1", status: "succeeded", result: { outputs, size: { width: 1, height: 1 } } })
    const handler = await handlerFor("firefly-generate-images-v3-async")
    const ctx = makeCtx(CONFIG)

    const result = await handler(
      { prompt: "a red fox", numVariations: 1, "x-model-version": "image4_standard", body: { prompt: "ignored", seeds: [5] } },
      ctx,
    )

    expect(result).toMatchObject({
      images: [{ kind: "url", url: "https://cdn.test/out.png", mediaType: "image/png" }],
      seeds: [1],
      size: { width: 1, height: 1 },
    })
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${FIREFLY}/v3/images/generate-async`,
      `GET ${statusUrl}`,
      `GET ${statusUrl}`,
    ])
    expect(calls[0]!.body).toEqual({ prompt: "a red fox", numVariations: 1, seeds: [5] })
    expect(calls[0]!.headers).toMatchObject({ "x-model-version": "image4_standard", "content-type": "application/json" })
    expect(ctx.logs).toEqual([expect.objectContaining({ level: "debug", detail: { statusUrl } })])
  })

  it("defaults caiClaimVersion to 2 when a style image is set", async () => {
    const { calls } = fireflyRoute({ status: "succeeded", result: { outputs: [] } }, [])
    const handler = await handlerFor("firefly-generate-images-v3-async")
    await handler({ prompt: "p", style: { imageReference: { source: { url: "https://cdn.test/s.png" } } } }, makeCtx(CONFIG))
    expect(calls[0]!.body).toMatchObject({ caiClaimVersion: 2 })
  })

  it("fails with ECP_INPUT_INVALID before any HTTP call when the merged body misses prompt", async () => {
    const { mock } = fireflyRoute({ status: "succeeded" })
    const handler = await handlerFor("firefly-generate-images-v3-async")
    await expect(handler({ numVariations: 1 }, makeCtx(CONFIG))).rejects.toMatchObject({
      code: "ECP_INPUT_INVALID",
      details: { issues: [expect.objectContaining({ path: "prompt" })] },
    })
    expect(mock).not.toHaveBeenCalled()
  })

  it("surfaces a failed job as ECP_PROVIDER_ERROR", async () => {
    fireflyRoute({ status: "failed", message: "content policy" }, [])
    const handler = await handlerFor("firefly-generate-images-v3-async")
    await expect(handler({ prompt: "p" }, makeCtx(CONFIG))).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      details: { status: "failed", message: "content policy" },
    })
  })

  it("fails when the submit response has no status URL", async () => {
    stubFetch(() => jsonResponse(202, { jobId: "job-1" }))
    const handler = await handlerFor("firefly-generate-images-v3-async")
    await expect(handler({ prompt: "p" }, makeCtx(CONFIG))).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      message: expect.stringContaining("no job status URL"),
    })
  })

  it("stops polling when the step signal aborts mid-poll", async () => {
    const controller = new AbortController()
    const { calls } = stubFetch((call, init) => {
      if (call.method === "POST") return jsonResponse(202, { statusUrl })
      if (calls.length >= 3) return hangUntilAborted(init)
      return jsonResponse(200, { status: "running" })
    })
    const handler = await handlerFor("firefly-generate-images-v3-async")
    const pending = handler({ prompt: "p" }, makeCtx(CONFIG, { signal: controller.signal }))
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(calls.every((c) => c.signal === controller.signal)).toBe(true)
  })
})

describe("photoshop-actions", () => {
  it("sends a UXP script string to the baseUrl override and returns the job result", async () => {
    const statusUrl = "https://proxy.test/v2/status/ps-1"
    const { calls } = stubFetch((call) => {
      if (call.method === "POST") return jsonResponse(202, { jobId: "ps-1", statusUrl })
      return jsonResponse(200, { jobId: "ps-1", status: "succeeded", result: { outputs: [{ destination: { url: "x" } }] } })
    })
    const handler = await handlerFor("photoshop-actions")
    const script = "const app = require('photoshop').app;"

    const result = await handler(
      {
        image: { kind: "url", url: "https://store.test/in.psd" },
        options: { uxp: { source: { content: script } } },
        outputs: [{ destination: { url: "https://store.test/out.psd" }, mediaType: "image/vnd.adobe.photoshop" }],
      },
      makeCtx({ ...CONFIG, baseUrl: "https://proxy.test" }),
    )

    expect(result).toMatchObject({
      psd: { kind: "url", url: "x", mediaType: "image/vnd.adobe.photoshop" },
    })
    expect(calls[0]!.url).toBe("https://proxy.test/v2/execute-actions")
    expect(calls[0]!.body).toMatchObject({ options: { uxp: { source: { content: script } } } })
    expect(calls[0]!.body).not.toHaveProperty("caiClaimVersion")
  })

  it("rejects a script longer than the API's 51200-character limit", async () => {
    const { mock } = stubFetch(() => jsonResponse(500, {}))
    const handler = await handlerFor("photoshop-actions")
    await expect(
      handler(
        {
          image: { kind: "url", url: "https://store.test/in.psd" },
          options: { uxp: { source: { content: "x".repeat(51_201) } } },
          outputs: [{ destination: { url: "https://store.test/o" }, mediaType: "image/png" }],
        },
        makeCtx(CONFIG),
      ),
    ).rejects.toMatchObject({ code: "ECP_INPUT_INVALID" })
    expect(mock).not.toHaveBeenCalled()
  })
})

describe("photoshop-generate-manifest", () => {
  it("adds embedded JSON outputs when none are given", async () => {
    const { calls } = stubFetch((call) =>
      call.method === "POST"
        ? jsonResponse(202, { statusUrl: `${PHOTOSHOP}/v2/status/m` })
        : jsonResponse(200, { status: "succeeded", result: { outputs: [{ layers: [] }] } }),
    )
    const handler = await handlerFor("photoshop-generate-manifest")
    const result = await handler(
      { image: { kind: "url", url: "https://store.test/in.psd" } },
      makeCtx(CONFIG),
    )
    expect(calls[0]!.body).toMatchObject({ outputs: [{ destination: { embedded: "json" }, mediaType: "application/json" }] })
    expect(result).toEqual({ layers: [] })
  })

  it("lifts destination.content onto outputs[i].content", async () => {
    const layers = [{ name: "Headline", type: "text_layer" }]
    const document = { bounds: { left: 0, right: 100, top: 0, bottom: 50 }, imageMode: "RGB" }
    stubFetch((call) =>
      call.method === "POST"
        ? jsonResponse(202, { statusUrl: `${PHOTOSHOP}/v2/status/m` })
        : jsonResponse(200, {
            status: "succeeded",
            result: {
              outputs: [
                {
                  destination: { embedded: "json", content: { layers, document } },
                },
              ],
            },
          }),
    )
    const handler = await handlerFor("photoshop-generate-manifest")
    const result = await handler({ image: { kind: "url", url: "https://store.test/in.psd" } }, makeCtx(CONFIG))
    expect(result).toEqual({ layers, document })
  })

  it("parses embedded JSON strings and lifts each output independently", async () => {
    stubFetch((call) =>
      call.method === "POST"
        ? jsonResponse(202, { statusUrl: `${PHOTOSHOP}/v2/status/m2` })
        : jsonResponse(200, {
            status: "succeeded",
            result: {
              outputs: [
                { destination: { embedded: "json", content: JSON.stringify({ layers: [{ id: 1 }] }) } },
                { destination: { embedded: "json", content: "{not-json" } },
              ],
            },
          }),
    )
    const handler = await handlerFor("photoshop-generate-manifest")
    const result = await handler({ image: { kind: "url", url: "https://store.test/in.psd" } }, makeCtx(CONFIG))
    expect(result).toEqual({ layers: [{ id: 1 }] })
  })
})

describe("handler guards", () => {
  it("fails with ECP_CONFIG_INVALID and no HTTP call when credentials are missing", async () => {
    const { mock } = stubFetch(() => jsonResponse(200, {}))
    const handler = await handlerFor("firefly-get-custom-models")
    await expect(handler({ "x-request-id": "r" }, makeCtx(undefined))).rejects.toMatchObject({ code: "ECP_CONFIG_INVALID" })
    await expect(handler({ "x-request-id": "r" }, makeCtx({ clientId: "only-id" }))).rejects.toMatchObject({
      code: "ECP_CONFIG_INVALID",
      details: { issues: [expect.objectContaining({ path: "clientSecret" })] },
    })
    expect(mock).not.toHaveBeenCalled()
  })

  it("rejects non-object input", async () => {
    const handler = await handlerFor("firefly-get-custom-models")
    await expect(handler("nope", makeCtx(CONFIG))).rejects.toMatchObject({ code: "ECP_INPUT_INVALID" })
    await expect(handler([1], makeCtx(CONFIG))).rejects.toMatchObject({ code: "ECP_INPUT_INVALID" })
  })

  it("throws for an unknown operation name", () => {
    expect(() => loadFirefly("firefly-nope")).toThrow("Unknown Adobe firefly operation firefly-nope.")
  })

  it("passes through a token request that uses the configured IMS endpoint and scopes", async () => {
    const ims = vi.fn(async () => tokenResponse("custom"))
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === "https://ims.example.test/token") return ims(String(init?.body))
      return jsonResponse(200, { ok: true })
    })
    const handler = await handlerFor("firefly-get-custom-models")
    await handler(
      { "x-request-id": "r" },
      makeCtx({ ...CONFIG, imsEndpoint: "https://ims.example.test/token", scopes: "openid firefly_api" }),
    )
    expect(ims).toHaveBeenCalledWith(expect.stringContaining("scope=openid%2Cfirefly_api"))
  })
})

describe.each([
  {
    family: "audio-video",
    name: "audio-video-avatars" as CapabilityName,
    url: "https://audio-video-api.adobe.io/v1/avatars",
    input: { "x-request-id": "av-1" },
  },
  {
    family: "creative-production",
    name: "creative-production-list-batches" as CapabilityName,
    url: "https://run-workflow.adobe.io/batches",
    input: { "api-version": "1.0" },
  },
  {
    family: "express",
    name: "express-tagged-documents" as CapabilityName,
    url: "https://express-api.adobe.io/beta/tagged-documents",
    input: { start: "0" },
  },
  {
    family: "indesign",
    name: "indesign-list-app-versions" as CapabilityName,
    url: "https://indesign.adobe.io/v3/app-versions",
    input: {},
  },
])("sync family capability: %s", ({ name, input }) => {
  it("returns the JSON body on success", async () => {
    const payload = { items: [{ id: "1" }] }
    stubFetch(() => jsonResponse(200, payload))
    const handler = await handlerFor(name)
    await expect(handler(input, makeCtx(CONFIG))).resolves.toEqual(payload)
  })

  it("maps an API error to ECP_PROVIDER_ERROR with the body", async () => {
    stubFetch(() => jsonResponse(502, { error: "bad_gateway" }))
    const handler = await handlerFor(name)
    await expect(handler(input, makeCtx(CONFIG))).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      details: { status: 502, body: { error: "bad_gateway" } },
    })
  })

  it("stops when the step signal aborts before the response", async () => {
    const controller = new AbortController()
    stubFetch((_call, init) => hangUntilAborted(init))
    const handler = await handlerFor(name)
    const pending = handler(input, makeCtx(CONFIG, { signal: controller.signal }))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  })
})

describe.each([
  {
    family: "illustrator",
    name: "illustrator-create-rendition" as CapabilityName,
    submitUrl: "https://illustrator-api.adobe.io/v1/create-rendition",
    statusUrl: "https://illustrator-api.adobe.io/v1/status/job-ill",
    input: {
      input: { source: { url: "https://storage.googleapis.com/c/test.ai" } },
      output: { mediaType: "image/png" },
      settings: { documentLevel: 1 },
    },
  },
  {
    family: "substance3d",
    name: "substance3d-v1-composites-compose" as CapabilityName,
    submitUrl: "https://s3d.adobe.io/v1/composites/compose",
    statusUrl: "https://s3d.adobe.io/v1/status/job-s3d",
    input: {
      prompt: "studio backdrop",
      heroAsset: "product",
      sources: [{ url: { url: "https://storage.googleapis.com/c/scene.sbsar" } }],
    },
  },
])("async family capability: %s", ({ name, submitUrl, statusUrl, input }) => {
  it("submits, polls and returns the unwrapped result", async () => {
    const result = { outputs: [{ seed: 1 }] }
    const { calls } = stubFetch((call) => {
      if (call.method === "POST") return jsonResponse(202, { jobId: "j1", statusUrl })
      return jsonResponse(200, { status: "succeeded", result })
    })
    const handler = await handlerFor(name)
    await expect(handler(input, makeCtx(CONFIG))).resolves.toEqual(result)
    expect(calls[0]!.url).toBe(submitUrl)
  })

  it("maps an API error to ECP_PROVIDER_ERROR with the body", async () => {
    stubFetch(() => jsonResponse(400, { message: "invalid scene" }))
    const handler = await handlerFor(name)
    await expect(handler(input, makeCtx(CONFIG))).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      details: { status: 400, body: { message: "invalid scene" } },
    })
  })

  it("stops polling when the step signal aborts mid-poll", async () => {
    const controller = new AbortController()
    const { calls } = stubFetch((call, init) => {
      if (call.method === "POST") return jsonResponse(202, { jobId: "j1", statusUrl })
      if (calls.length >= 3) return hangUntilAborted(init)
      return jsonResponse(200, { status: "running" })
    })
    const handler = await handlerFor(name)
    const pending = handler(input, makeCtx(CONFIG, { signal: controller.signal }))
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  })
})
