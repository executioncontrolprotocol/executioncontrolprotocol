import { afterEach, describe, expect, it, vi } from "vitest"
import {
  collectBrowserLocators,
  createCapabilityArtifactStore,
  createCapabilityBlobStore,
  createUsageLedger,
  hydrateCapabilityBlobs,
  resolveFile,
  serializeCapabilityBlobs,
  writeMediaArtifact,
  STORAGE_ARTIFACT_URI_PREFIX,
  stashCapabilityBlob,
} from "../src/index.js"

const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

function makeCtx(overrides: {
  artifacts?: ReturnType<typeof createCapabilityArtifactStore>
  blobs?: ReturnType<typeof createCapabilityBlobStore>
  call?: (id: string, input: unknown) => Promise<unknown>
  extensionConfig?: Record<string, unknown>
} = {}) {
  return {
    store: {
      merge: async () => undefined,
      set: async () => undefined,
      replace: async () => undefined,
      append: async () => undefined,
    },
    state: {},
    run: { id: "r1", input: {} },
    step: { id: "s1", capabilityId: "test.media" },
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    usage: createUsageLedger(),
    capabilities: { call: overrides.call ?? (async () => ({})) },
    artifacts: overrides.artifacts,
    blobs: overrides.blobs,
    extensionConfig: overrides.extensionConfig,
  }
}

describe("resolveFile / writeMediaArtifact", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("resolves buffer refs", async () => {
    const resolved = await resolveFile(
      { kind: "buffer", data: PNG_1X1_BASE64, mediaType: "image/png" },
      makeCtx()
    )
    expect(resolved.sizeBytes).toBeGreaterThan(0)
    expect(resolved.mediaType).toBe("image/png")
    expect(resolved.bytes[0]).toBe(0x89)
  })

  it("resolves browser file locators via ctx.blobs", async () => {
    const blobs = createCapabilityBlobStore()
    const bytes = new Uint8Array([1, 2, 3])
    const locator = stashCapabilityBlob(blobs, {
      name: "a.bin",
      type: "application/octet-stream",
      size: 3,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    })
    const resolved = await resolveFile({ kind: "file", path: locator }, makeCtx({ blobs }))
    expect([...resolved.bytes]).toEqual([1, 2, 3])
    expect(resolved.name).toBe("a.bin")
  })

  it("resolves artifact refs that use browser locators", async () => {
    const blobs = createCapabilityBlobStore()
    const bytes = new Uint8Array([4, 5])
    const locator = stashCapabilityBlob(blobs, {
      name: "b.bin",
      type: "application/octet-stream",
      size: 2,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    })
    const resolved = await resolveFile({ kind: "artifact", uri: locator }, makeCtx({ blobs }))
    expect([...resolved.bytes]).toEqual([4, 5])
  })

  it("resolves host artifacts via ctx.artifacts", async () => {
    const artifacts = createCapabilityArtifactStore()
    const uri = "ecp://artifacts/in.png"
    artifacts.set(uri, {
      mediaType: "image/png",
      name: "in.png",
      size: 2,
      bytes: new Uint8Array([9, 8]),
    })
    const resolved = await resolveFile({ kind: "artifact", uri }, makeCtx({ artifacts }))
    expect([...resolved.bytes]).toEqual([9, 8])
    expect(resolved.mediaType).toBe("image/png")
    expect(resolved.name).toBe("in.png")
  })

  it("rejects remote urls unless allowRemoteUrls", async () => {
    await expect(
      resolveFile({ kind: "url", url: "https://example.com/x.png" }, makeCtx())
    ).rejects.toThrow(/allowRemoteUrls/)
  })

  it("fetches url refs when allowRemoteUrls is enabled via options", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: { get: (k: string) => (k === "content-type" ? "image/png" : null) },
        arrayBuffer: async () => new Uint8Array([11, 12]).buffer,
      }))
    )
    const resolved = await resolveFile(
      { kind: "url", url: "https://example.com/x.png" },
      makeCtx(),
      { allowRemoteUrls: true }
    )
    expect([...resolved.bytes]).toEqual([11, 12])
    expect(resolved.mediaType).toBe("image/png")
  })

  it("fetches url refs when allowRemoteUrls is enabled via extensionConfig", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      }))
    )
    const resolved = await resolveFile(
      { kind: "url", url: "https://example.com/y.png", mediaType: "image/webp" },
      makeCtx({ extensionConfig: { limits: { allowRemoteUrls: true } } })
    )
    expect([...resolved.bytes]).toEqual([1])
    expect(resolved.mediaType).toBe("image/webp")
  })

  it("rejects non-ok url fetch responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0),
      }))
    )
    await expect(
      resolveFile({ kind: "url", url: "https://example.com/missing.png" }, makeCtx(), {
        allowRemoteUrls: true,
      })
    ).rejects.toThrow(/Failed to fetch media URL: 404/)
  })

  it("reads durable storage artifacts via capability hop", async () => {
    const resolved = await resolveFile(
      { kind: "artifact", uri: `${STORAGE_ARTIFACT_URI_PREFIX}k1`, mediaType: "text/plain" },
      makeCtx({
        call: async (id) => {
          expect(id).toBe("@executioncontrolprotocol/storage.read")
          return { value: new Uint8Array([7]) }
        },
      })
    )
    expect([...resolved.bytes]).toEqual([7])
  })

  it("reads durable storage artifacts encoded as base64 strings", async () => {
    const resolved = await resolveFile(
      { kind: "artifact", uri: `${STORAGE_ARTIFACT_URI_PREFIX}k2` },
      makeCtx({
        call: async () => ({ value: Buffer.from([9, 10]).toString("base64") }),
      })
    )
    expect([...resolved.bytes]).toEqual([9, 10])
  })

  it("rejects storage artifacts with empty read payloads", async () => {
    await expect(
      resolveFile(
        { kind: "artifact", uri: `${STORAGE_ARTIFACT_URI_PREFIX}missing` },
        makeCtx({ call: async () => ({}) })
      )
    ).rejects.toThrow(/Artifact not found/)
  })

  it("writes artifacts to ctx.artifacts and returns ImageRef", async () => {
    const artifacts = createCapabilityArtifactStore()
    const ref = await writeMediaArtifact(
      new Uint8Array([4, 5]),
      { mediaType: "image/png", name: "out.png", prefix: "artifacts/images" },
      makeCtx({ artifacts })
    )
    expect(ref.kind).toBe("artifact")
    if (ref.kind !== "artifact") throw new Error("expected artifact")
    expect(ref.uri).toContain("artifacts/images/out.png")
    expect(artifacts.get(ref.uri)?.size).toBe(2)
  })

  it("round-trips write then resolve through ctx.artifacts", async () => {
    const artifacts = createCapabilityArtifactStore()
    const ctx = makeCtx({ artifacts })
    const written = await writeMediaArtifact(
      new Uint8Array([21, 22, 23]),
      { mediaType: "application/octet-stream", name: "rt.bin" },
      ctx
    )
    const resolved = await resolveFile(written, ctx)
    expect([...resolved.bytes]).toEqual([21, 22, 23])
  })

  it("uses default artifacts/media prefix when none is provided", async () => {
    const artifacts = createCapabilityArtifactStore()
    const ref = await writeMediaArtifact(
      new Uint8Array([1]),
      { mediaType: "image/png", name: "default.png" },
      makeCtx({ artifacts })
    )
    expect(ref.kind).toBe("artifact")
    if (ref.kind === "artifact") {
      expect(ref.uri).toBe("ecp://artifacts/media/default.png")
    }
  })

  it("derives default artifact filename extension from mediaType", async () => {
    const artifacts = createCapabilityArtifactStore()
    const ref = await writeMediaArtifact(
      new Uint8Array([1, 2]),
      { mediaType: "image/webp" },
      makeCtx({ artifacts })
    )
    expect(ref.kind).toBe("artifact")
    if (ref.kind === "artifact") {
      expect(ref.uri).toMatch(/\.webp$/)
      expect(ref.name).toMatch(/\.webp$/)
      expect(artifacts.get(ref.uri)?.name).toMatch(/\.webp$/)
    }
  })

  it("honors extensionConfig storage.outputPrefix and defaultStore", async () => {
    let wrote: unknown
    const ref = await writeMediaArtifact(
      new Uint8Array([3]),
      { mediaType: "image/png", name: "cfg.png" },
      makeCtx({
        extensionConfig: {
          storage: { outputPrefix: "uploads", defaultStore: "storage" },
        },
        call: async (_id, input) => {
          wrote = input
          return {}
        },
      })
    )
    expect(ref.kind).toBe("artifact")
    if (ref.kind === "artifact") {
      expect(ref.uri).toBe(`${STORAGE_ARTIFACT_URI_PREFIX}uploads/cfg.png`)
    }
    expect(wrote).toMatchObject({ key: "uploads/cfg.png" })
  })

  it("fails write when artifact store is missing", async () => {
    await expect(
      writeMediaArtifact(new Uint8Array([1]), { mediaType: "image/png" }, makeCtx())
    ).rejects.toThrow(/artifact store/)
  })

  it("rejects missing browser locator", async () => {
    await expect(
      resolveFile(
        { kind: "file", path: "ecp://browser/missing" },
        makeCtx({ blobs: createCapabilityBlobStore() })
      )
    ).rejects.toThrow(/No file stashed/)
  })

  it("rejects missing host artifact", async () => {
    await expect(
      resolveFile(
        { kind: "artifact", uri: "ecp://artifacts/gone" },
        makeCtx({ artifacts: createCapabilityArtifactStore() })
      )
    ).rejects.toThrow(/Artifact not found/)
  })

  it("resolves a Node file path", async () => {
    const fs = await import("node:fs/promises")
    const os = await import("node:os")
    const path = await import("node:path")
    const file = path.join(os.tmpdir(), `ecp-media-${Date.now()}.bin`)
    await fs.writeFile(file, Buffer.from([10, 20, 30]))
    try {
      const resolved = await resolveFile({ kind: "file", path: file }, makeCtx())
      expect([...resolved.bytes]).toEqual([10, 20, 30])
    } finally {
      await fs.unlink(file).catch(() => undefined)
    }
  })

  it("rejects missing Node file paths", async () => {
    await expect(
      resolveFile({ kind: "file", path: "C:\\definitely-missing-ecp-media.bin" }, makeCtx())
    ).rejects.toThrow()
  })

  it("writes to storage when store is storage", async () => {
    let wrote: unknown
    const ref = await writeMediaArtifact(
      new Uint8Array([1, 2]),
      { mediaType: "image/png", name: "x.png", prefix: "out", store: "storage" },
      makeCtx({
        call: async (id, input) => {
          expect(id).toBe("@executioncontrolprotocol/storage.write")
          wrote = input
          return {}
        },
      })
    )
    expect(ref.kind).toBe("artifact")
    if (ref.kind === "artifact") {
      expect(ref.uri).toBe(`${STORAGE_ARTIFACT_URI_PREFIX}out/x.png`)
    }
    expect(wrote).toMatchObject({ key: "out/x.png" })
  })

  it("host-hop serializes ImageRef browser locators then resolveFile on hydrate", async () => {
    const browserStore = createCapabilityBlobStore()
    const bytes = new Uint8Array([42, 43])
    const locator = stashCapabilityBlob(browserStore, {
      name: "hop.png",
      type: "image/png",
      size: 2,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    })
    const payload = { image: { kind: "file" as const, path: locator, mediaType: "image/png" } }
    const locators = collectBrowserLocators(payload)
    expect(locators).toEqual([locator])
    const serialized = await serializeCapabilityBlobs(browserStore, locators)
    const hostStore = createCapabilityBlobStore()
    hydrateCapabilityBlobs(hostStore, serialized)
    const resolved = await resolveFile(payload.image, makeCtx({ blobs: hostStore }))
    expect([...resolved.bytes]).toEqual([42, 43])
    expect(resolved.mediaType).toBe("image/png")
  })
})
