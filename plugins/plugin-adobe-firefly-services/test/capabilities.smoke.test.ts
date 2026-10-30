import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { parse as parseYaml } from "yaml"
import { Registry, NODE_ENVIRONMENT_ID, resolveCapabilityExecution, capabilityIdSchema } from "@executioncontrolprotocol/core"
import {
  adobeFireflyServicesExtension,
  ADOBE_GENERATED_OPERATION_COUNT,
  adobeGeneratedCapabilities,
} from "../src/index.js"
import meta from "../src/generated/meta.json"

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const openapiDir = join(pkgRoot, "openapi")
const generatedDir = join(pkgRoot, "src", "generated")

type Handler = (input: unknown, ctx: unknown) => Promise<unknown>

function capability(id: string): Handler {
  const cap = adobeFireflyServicesExtension.capabilities.find((c) => c.id === id)
  if (!cap) throw new Error(`missing capability ${id}`)
  return cap.handler as Handler
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === "overlays" || name === "content-tagging") continue
      walkFiles(p, out)
    } else if (/\.(json|ya?ml)$/i.test(name)) {
      out.push(p)
    }
  }
  return out
}

function countOpenApiOperations(): number {
  let ops = 0
  for (const file of walkFiles(openapiDir)) {
    const text = readFileSync(file, "utf8")
    const doc = /\.ya?ml$/i.test(file) ? parseYaml(text) : JSON.parse(text)
    for (const item of Object.values(doc.paths ?? {}) as Record<string, unknown>[]) {
      for (const method of ["get", "post", "put", "patch", "delete", "head", "options"]) {
        if (item[method]) ops++
      }
    }
  }
  return ops
}

function collectGeneratedSources(): string[] {
  const files: string[] = []
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith(".ts")) files.push(p)
    }
  }
  walk(generatedDir)
  return files
}

const ctx = {
  extensionConfig: {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
  },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("@executioncontrolprotocol/adobe-firefly-services capabilities", () => {
  beforeEach(async () => {
    await new Registry().registerExtension(adobeFireflyServicesExtension)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("registers extension with generated capability count matching OpenAPI minus status-cancel", () => {
    const openApiOps = countOpenApiOperations()
    expect(openApiOps).toBe(84)
    expect(meta.skippedStatusCancel).toBe(16)
    const generated = openApiOps - meta.skippedStatusCancel
    expect(generated).toBe(68)
    expect(ADOBE_GENERATED_OPERATION_COUNT).toBe(generated)
    expect(adobeGeneratedCapabilities).toHaveLength(generated)
    expect(meta.operationCount).toBe(generated)
    expect(adobeFireflyServicesExtension.capabilities).toHaveLength(generated)

    const ids = adobeFireflyServicesExtension.capabilities.map((c) => c.id).sort()
    expect(ids).toEqual([...meta.operations].sort())
    expect(ids.some((id) => /job-status|job-result|cancel/.test(id))).toBe(false)
    expect(adobeFireflyServicesExtension.id).toBe("@executioncontrolprotocol/adobe-firefly-services")
    expect(adobeFireflyServicesExtension.metadata?.topicAlias).toBe("firefly")
    expect(adobeFireflyServicesExtension.supportedEnvironments).toEqual([
      { id: NODE_ENVIRONMENT_ID },
    ])
    expect(
      resolveCapabilityExecution(adobeFireflyServicesExtension.capabilities[0]!, adobeFireflyServicesExtension)
    ).toBe("host")
  })

  it("allows binding without Adobe credentials", () => {
    const schema = adobeFireflyServicesExtension.configSchema
    expect(schema).toBeDefined()
    expect(schema!.safeParse({}).success).toBe(true)
    expect(schema!.safeParse({ clientId: "id", clientSecret: "secret" }).success).toBe(true)
  })

  it("rejects non-string Adobe credentials", () => {
    const schema = adobeFireflyServicesExtension.configSchema
    expect(schema!.safeParse({ clientId: 1 }).success).toBe(false)
    expect(schema!.safeParse({ clientSecret: true }).success).toBe(false)
  })

  it("invoke still requires credentials at runtime", async () => {
    await expect(
      capability("@executioncontrolprotocol/adobe-firefly-services.firefly-generate-images-v3-async")(
        { prompt: "dusk" },
        { extensionConfig: {} },
      ),
    ).rejects.toThrow(/clientId and clientSecret are required/)
  })

  it("emits capability ids that pass capabilityIdSchema", () => {
    for (const id of meta.operations) {
      const parsed = capabilityIdSchema.safeParse(id)
      expect(parsed.success, `${id}: ${parsed.error?.message}`).toBe(true)
    }
  })

  it("exposes Zod input/output schemas on every capability", () => {
    for (const cap of adobeFireflyServicesExtension.capabilities) {
      expect(cap.inputSchema, cap.id).toBeDefined()
      expect(cap.outputSchema, cap.id).toBeDefined()
      expect(typeof cap.inputSchema?.safeParse).toBe("function")
      expect(typeof cap.outputSchema?.safeParse).toBe("function")
    }
  })

  it("sample fixtures safeParse for representative family inputs", () => {
    const fixtures: { id: string; input: unknown }[] = [
      {
        id: "@executioncontrolprotocol/adobe-firefly-services.firefly-generate-images-v3-async",
        input: { prompt: "sunset" },
      },
      {
        id: "@executioncontrolprotocol/adobe-firefly-services.firefly-generate-images-v3-async",
        input: { body: { prompt: "sunset" } },
      },
      {
        id: "@executioncontrolprotocol/adobe-firefly-services.express-tagged-documents",
        input: {},
      },
      {
        id: "@executioncontrolprotocol/adobe-firefly-services.indesign-list-app-versions",
        input: {},
      },
      {
        id: "@executioncontrolprotocol/adobe-firefly-services.substance3d-create-space-v1",
        input: {},
      },
      {
        id: "@executioncontrolprotocol/adobe-firefly-services.creative-production-list-batches",
        input: {},
      },
      {
        id: "@executioncontrolprotocol/adobe-firefly-services.audio-video-voices",
        input: {},
      },
    ]

    for (const { id, input } of fixtures) {
      const cap = adobeFireflyServicesExtension.capabilities.find((c) => c.id === id)
      expect(cap, id).toBeDefined()
      const parsed = cap!.inputSchema!.safeParse(input)
      expect(parsed.success, `${id}: ${JSON.stringify(parsed.error?.format())}`).toBe(true)
    }
  })

  it("forbids z.unknown, z.any, and untyped z.record in generated sources", () => {
    for (const file of collectGeneratedSources()) {
      const src = readFileSync(file, "utf8")
      expect(src, file).not.toMatch(/\bz\.unknown\b/)
      expect(src, file).not.toMatch(/\bz\.any\b/)
      // Typed maps only (key schema + value schema). Untyped z.record() / z.record(z.unknown()) forbidden.
      expect(src, file).not.toMatch(/\bz\.record\(\s*\)/)
      expect(src, file).not.toMatch(/\bz\.record\(\s*z\.(unknown|any)\b/)
      const records = [...src.matchAll(/\bz\.record\s*\(/g)]
      for (const match of records) {
        const start = match.index ?? 0
        const snippet = src.slice(start, start + 80)
        expect(snippet, `${file}: ${snippet}`).toMatch(/^z\.record\(\s*z\.string\(\)\s*,/)
      }
    }
  })

  it("classifies generated operations into async-submit and sync", () => {
    expect(meta.operationClasses).toEqual({
      "async-submit": 48,
      sync: 20,
    })
    expect(meta.operationClassById["@executioncontrolprotocol/adobe-firefly-services.photoshop-generate-manifest"]).toBe(
      "async-submit",
    )
    expect(
      meta.operationClassById["@executioncontrolprotocol/adobe-firefly-services.photoshop-get-job-status"],
    ).toBeUndefined()
    expect(meta.operationClassById["@executioncontrolprotocol/adobe-firefly-services.audio-video-voices"]).toBe("sync")
    expect(
      meta.operationClassById["@executioncontrolprotocol/adobe-firefly-services.firefly-generate-images-v5-async"],
    ).toBe("async-submit")
  })

  it("async-submit inputs omit poll knobs", () => {
    const cap = adobeFireflyServicesExtension.capabilities.find(
      (c) => c.id === "@executioncontrolprotocol/adobe-firefly-services.photoshop-generate-manifest",
    )
    expect(cap).toBeDefined()
    const ok = cap!.inputSchema!.safeParse({
      body: {
        image: { source: { url: "https://x.example/a.psd" } },
        outputs: [
          {
            mediaType: "application/json",
            destination: { storageType: "azure", url: "https://x.example/m.json" },
          },
        ],
      },
    })
    expect(ok.success, JSON.stringify(ok.error?.format())).toBe(true)
    expect(ok.data).not.toHaveProperty("poll")
    expect(ok.data).not.toHaveProperty("pollIntervalMs")
    expect(ok.data).not.toHaveProperty("pollTimeoutMs")
    const withPollKnobs = cap!.inputSchema!.safeParse({
      image: { source: { url: "https://x.example/a.psd" } },
      pollIntervalMs: 1000,
    })
    expect(withPollKnobs.success).toBe(true)
    expect(withPollKnobs.data).not.toHaveProperty("pollIntervalMs")
  })

  it("points firefly generate-images output at JobResult fields", () => {
    const cap = adobeFireflyServicesExtension.capabilities.find(
      (c) => c.id === "@executioncontrolprotocol/adobe-firefly-services.firefly-generate-images-v3-async",
    )
    expect(cap).toBeDefined()
    const parsed = cap!.outputSchema!.safeParse({
      outputs: [{ seed: 1, image: { url: "https://cdn.example/out.png" } }],
    })
    expect(parsed.success, JSON.stringify(parsed.error?.format())).toBe(true)
    expect(cap!.metadata?.projections?.some((p) => /job identifier/i.test(p.summary))).toBe(false)
  })

  it("accepts poll timing on extension config", () => {
    const schema = adobeFireflyServicesExtension.configSchema
    expect(schema!.safeParse({ pollIntervalMs: 500, pollTimeoutMs: 10_000 }).success).toBe(true)
    expect(schema!.safeParse({ pollIntervalMs: 0 }).success).toBe(false)
    expect(schema!.safeParse({ pollTimeoutMs: -1 }).success).toBe(false)
  })

  it("invokes one mocked call per family", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("adobelogin.com") || url.includes("/ims/token")) {
        return jsonResponse({ access_token: "tok", expires_in: 3600 })
      }
      if (url.includes("firefly-api.adobe.io") && url.includes("generate-async")) {
        return jsonResponse({
          jobId: "ff-1",
          statusUrl: "https://firefly-api.adobe.io/v3/status/ff-1",
          cancelUrl: "https://firefly-api.adobe.io/v3/cancel/ff-1",
        })
      }
      if (url.includes("firefly-api.adobe.io") && url.includes("/v3/status/ff-1")) {
        return jsonResponse({
          status: "succeeded",
          jobId: "ff-1",
          result: { outputs: [{ seed: 1, image: { url: "https://cdn.example/out.png" } }] },
        })
      }
      if (url.includes("express-api.adobe.io") && url.includes("tagged-documents")) {
        return jsonResponse({ documents: [] })
      }
      if (url.includes("indesign.adobe.io") && url.includes("app-versions")) {
        return jsonResponse([{ product: "InDesign", status: "active" }])
      }
      if (url.includes("s3d.adobe.io") && url.includes("/v1/spaces")) {
        return jsonResponse({
          id: "space-1",
          url: "https://space.example/1",
          expiry: "2099-01-01T00:00:00Z",
          files: null,
        })
      }
      if (url.includes("run-workflow.adobe.io") && url.includes("/batches")) {
        return jsonResponse({
          orgId: "org",
          batches: [],
          pagination: { limit: 10, offset: 0, count: 0, hasMore: false },
        })
      }
      if (url.includes("audio-video-api.adobe.io") && url.includes("/v1/voices")) {
        return jsonResponse({ voices: [] })
      }
      return jsonResponse({ unexpected: url }, 500)
    })
    vi.stubGlobal("fetch", fetchImpl)

    const cases: { id: string; input: unknown }[] = [
      {
        id: "@executioncontrolprotocol/adobe-firefly-services.firefly-generate-images-v3-async",
        input: { prompt: "dunes" },
      },
      {
        id: "@executioncontrolprotocol/adobe-firefly-services.express-tagged-documents",
        input: {},
      },
      {
        id: "@executioncontrolprotocol/adobe-firefly-services.indesign-list-app-versions",
        input: {},
      },
      {
        id: "@executioncontrolprotocol/adobe-firefly-services.substance3d-create-space-v1",
        input: {},
      },
      {
        id: "@executioncontrolprotocol/adobe-firefly-services.creative-production-list-batches",
        input: {},
      },
      {
        id: "@executioncontrolprotocol/adobe-firefly-services.audio-video-voices",
        input: {},
      },
    ]

    for (const { id, input } of cases) {
      await expect(capability(id)(input, ctx), id).resolves.toBeDefined()
    }
    expect(fetchImpl.mock.calls.some((c) => String(c[0]).includes("ims"))).toBe(true)
  })

  it("photoshop-generate-manifest polls and returns manifest JSON", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("adobelogin.com") || url.includes("/ims/token")) {
        return jsonResponse({ access_token: "tok", expires_in: 3600 })
      }
      if (url.includes("photoshop-api.adobe.io") && url.includes("/v2/generate-manifest")) {
        return jsonResponse({
          jobId: "m-1",
          statusUrl: "https://photoshop-api.adobe.io/v2/status/m-1",
        })
      }
      if (url.includes("photoshop-api.adobe.io") && url.includes("/v2/status/m-1")) {
        return jsonResponse({ jobId: "m-1", status: "succeeded", result: {} })
      }
      if (url.includes("blob.example/manifest.json")) {
        return jsonResponse({ layers: [{ id: 7, name: "Headline" }], name: "Poster" })
      }
      return jsonResponse({ unexpected: url }, 500)
    })
    vi.stubGlobal("fetch", fetchImpl)

    const out = await capability(
      "@executioncontrolprotocol/adobe-firefly-services.photoshop-generate-manifest",
    )(
      {
        image: { source: { url: "https://blob.example/a.psd" } },
        outputs: [
          {
            mediaType: "application/json",
            destination: { storageType: "azure", url: "https://blob.example/manifest.json" },
          },
        ],
      },
      { ...ctx, extensionConfig: { ...ctx.extensionConfig, pollIntervalMs: 1, pollTimeoutMs: 5_000 } },
    )

    expect(out).toEqual({ layers: [{ id: 7, name: "Headline" }], name: "Poster" })
  })

  it("generate-images returns unwrapped outputs, not the job envelope", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("adobelogin.com") || url.includes("/ims/token")) {
        return jsonResponse({ access_token: "tok", expires_in: 3600 })
      }
      if (url.includes("firefly-api.adobe.io") && url.includes("generate-async")) {
        return jsonResponse({
          jobId: "ff-1",
          statusUrl: "https://firefly-api.adobe.io/v3/status/ff-1",
        })
      }
      if (url.includes("/v3/status/ff-1")) {
        return jsonResponse({
          status: "succeeded",
          jobId: "ff-1",
          result: { outputs: [{ seed: 1, image: { url: "https://cdn.example/out.png" } }] },
        })
      }
      return jsonResponse({ unexpected: url }, 500)
    })
    vi.stubGlobal("fetch", fetchImpl)

    const out = await capability(
      "@executioncontrolprotocol/adobe-firefly-services.firefly-generate-images-v3-async",
    )({ prompt: "dunes" }, ctx)

    expect(out).toEqual({
      outputs: [{ seed: 1, image: { url: "https://cdn.example/out.png" } }],
    })
    expect(out).not.toHaveProperty("status")
    expect(out).not.toHaveProperty("jobId")
    expect(out).not.toHaveProperty("result")
  })

  it("failed poll throws before unwrap", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("adobelogin.com") || url.includes("/ims/token")) {
        return jsonResponse({ access_token: "tok", expires_in: 3600 })
      }
      if (url.includes("generate-async")) {
        return jsonResponse({
          jobId: "ff-fail",
          statusUrl: "https://firefly-api.adobe.io/v3/status/ff-fail",
        })
      }
      if (url.includes("/v3/status/ff-fail")) {
        return jsonResponse({
          status: "failed",
          jobId: "ff-fail",
          result: { outputs: [{ seed: 1, image: { url: "https://cdn.example/out.png" } }] },
        })
      }
      return jsonResponse({ unexpected: url }, 500)
    })
    vi.stubGlobal("fetch", fetchImpl)

    await expect(
      capability("@executioncontrolprotocol/adobe-firefly-services.firefly-generate-images-v3-async")(
        { prompt: "dunes" },
        ctx,
      ),
    ).rejects.toThrow(/Adobe async job failed/)
  })

  it("extension config pollTimeoutMs reaches pollAdobeJob", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("adobelogin.com") || url.includes("/ims/token")) {
        return jsonResponse({ access_token: "tok", expires_in: 3600 })
      }
      if (url.includes("generate-async")) {
        return jsonResponse({
          jobId: "ff-slow",
          statusUrl: "https://firefly-api.adobe.io/v3/status/ff-slow",
        })
      }
      if (url.includes("/v3/status/ff-slow")) {
        return jsonResponse({ status: "running", jobId: "ff-slow" })
      }
      return jsonResponse({ unexpected: url }, 500)
    })
    vi.stubGlobal("fetch", fetchImpl)

    await expect(
      capability("@executioncontrolprotocol/adobe-firefly-services.firefly-generate-images-v3-async")(
        { prompt: "dunes" },
        {
          extensionConfig: {
            ...ctx.extensionConfig,
            pollIntervalMs: 1,
            pollTimeoutMs: 5,
          },
        },
      ),
    ).rejects.toThrow(/timed out/)
  })
})
