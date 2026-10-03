import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { parse as parseYaml } from "yaml"
import { globalRegistry, NODE_RUNTIME_ID, resolveCapabilityExecution, capabilityIdSchema } from "@executioncontrolprotocol/core"
import {
  adobeFireflyServicesExtension,
  registerAdobeFireflyServicesExtension,
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
    await registerAdobeFireflyServicesExtension()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("registers extension with generated capability count matching OpenAPI", () => {
    const openApiOps = countOpenApiOperations()
    expect(openApiOps).toBe(84)
    expect(ADOBE_GENERATED_OPERATION_COUNT).toBe(openApiOps)
    expect(adobeGeneratedCapabilities).toHaveLength(openApiOps)
    expect(meta.operationCount).toBe(openApiOps)
    expect(adobeFireflyServicesExtension.capabilities).toHaveLength(openApiOps)

    const ids = adobeFireflyServicesExtension.capabilities.map((c) => c.id).sort()
    expect(ids).toEqual([...meta.operations].sort())
    expect(globalRegistry.getExtension("@executioncontrolprotocol/adobe-firefly-services")).toBe(adobeFireflyServicesExtension)
    expect(adobeFireflyServicesExtension.supportedRuntimes).toEqual([NODE_RUNTIME_ID])
    expect(
      resolveCapabilityExecution(adobeFireflyServicesExtension.capabilities[0]!, adobeFireflyServicesExtension)
    ).toBe("host")
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
        input: { body: { prompt: "sunset" } },
      },
      {
        id: "@executioncontrolprotocol/adobe-firefly-services.photoshop-get-job-status",
        input: { path: { jobId: "job-1" } },
      },
      {
        id: "@executioncontrolprotocol/adobe-firefly-services.express-get-job-status",
        input: { path: { jobId: "job-2" } },
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
        id: "@executioncontrolprotocol/adobe-firefly-services.illustrator-facade-job-status",
        input: { path: { jobId: "job-3" } },
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

  it("classifies operations into async-submit, status-cancel, and sync", () => {
    expect(meta.operationClasses).toEqual({
      "async-submit": 48,
      "status-cancel": 16,
      sync: 20,
    })
    expect(meta.operationClassById["@executioncontrolprotocol/adobe-firefly-services.photoshop-generate-manifest"]).toBe(
      "async-submit",
    )
    expect(meta.operationClassById["@executioncontrolprotocol/adobe-firefly-services.photoshop-get-job-status"]).toBe(
      "status-cancel",
    )
    expect(meta.operationClassById["@executioncontrolprotocol/adobe-firefly-services.audio-video-voices"]).toBe("sync")
    expect(
      meta.operationClassById["@executioncontrolprotocol/adobe-firefly-services.firefly-generate-images-v5-async"],
    ).toBe("async-submit")
  })

  it("async-submit inputs keep wait knobs and do not require poll", () => {
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
      pollIntervalMs: 1000,
    })
    expect(ok.success, JSON.stringify(ok.error?.format())).toBe(true)
    expect(ok.data).not.toHaveProperty("poll")
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
      if (url.includes("photoshop-api.adobe.io") && url.includes("/v2/status/")) {
        return jsonResponse({ jobId: "ps-1", status: "succeeded" })
      }
      if (url.includes("express-api.adobe.io") && url.includes("/status/")) {
        return jsonResponse({ jobId: "ex-1", status: "succeeded" })
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
      if (url.includes("illustrator-api.adobe.io") && url.includes("/v1/status/")) {
        return jsonResponse({
          jobId: "ai-1",
          status: "failed",
          error_code: "x",
          message: "boom",
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
        input: { body: { prompt: "dunes" } },
      },
      {
        id: "@executioncontrolprotocol/adobe-firefly-services.photoshop-get-job-status",
        input: { path: { jobId: "ps-1" } },
      },
      {
        id: "@executioncontrolprotocol/adobe-firefly-services.express-get-job-status",
        input: { path: { jobId: "ex-1" } },
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
        id: "@executioncontrolprotocol/adobe-firefly-services.illustrator-facade-job-status",
        input: { path: { jobId: "ai-1" } },
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
        body: {
          image: { source: { url: "https://blob.example/a.psd" } },
          outputs: [
            {
              mediaType: "application/json",
              destination: { storageType: "azure", url: "https://blob.example/manifest.json" },
            },
          ],
        },
        pollIntervalMs: 1,
        pollTimeoutMs: 5_000,
      },
      ctx,
    )

    expect(out).toEqual({ layers: [{ id: 7, name: "Headline" }], name: "Poster" })
  })
})
