import { describe, expect, it, beforeEach } from "vitest"
import { createCapabilityArtifactStore, globalRegistry } from "@executioncontrolprotocol/core"
import {
  registerImageSharpExtension,
  imageSharpExtension,
  clearImageArtifactStore,
} from "../src/index.js"
import { FIXTURE_PNG_BASE64 } from "./fixtures.js"

type Handler = (input: unknown, ctx: unknown) => Promise<unknown>

function capability(id: string): Handler {
  const cap = imageSharpExtension.capabilities.find((c) => c.id === id)
  if (!cap) throw new Error(`missing capability ${id}`)
  return cap.handler as Handler
}

function makeCtx(artifacts = createCapabilityArtifactStore()) {
  return {
    extensionConfig: {
      limits: { allowRemoteUrls: false, maxPixels: 80_000_000 },
      defaults: { format: "png", quality: 90, stripMetadata: true, failOn: "warning" },
    },
    usage: { increment: () => undefined },
    capabilities: { call: async () => ({}) },
    store: {
      merge: async () => undefined,
      set: async () => undefined,
      replace: async () => undefined,
      append: async () => undefined,
    },
    state: {},
    run: { id: "r1", input: {} },
    step: { id: "s1", capabilityId: "@executioncontrolprotocol/image-sharp.transform" },
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    artifacts,
  }
}

const bufferImage = {
  kind: "buffer" as const,
  data: FIXTURE_PNG_BASE64,
  mediaType: "image/png",
}

describe("@executioncontrolprotocol/image-sharp", () => {
  beforeEach(async () => {
    clearImageArtifactStore()
    await registerImageSharpExtension()
  })

  it("registers extension with supported runtimes", () => {
    const ext = globalRegistry.getExtension("@executioncontrolprotocol/image-sharp")
    expect(ext?.supportedRuntimes).toEqual(["@executioncontrolprotocol/node"])
    expect(ext?.capabilities.length).toBeGreaterThanOrEqual(10)
    expect(ext?.capabilities.every((cap) => cap.execution === undefined)).toBe(true)
  })

  it("inspect returns metadata and derived facts", async () => {
    const out = (await capability("@executioncontrolprotocol/image-sharp.inspect")(
      { image: bufferImage, include: ["metadata"] },
      makeCtx()
    )) as { metadata: { width?: number }; derived: { orientation: string } }
    expect(out.metadata.width).toBe(1)
    expect(out.derived.orientation).toBe("square")
  })

  it("transform resizes and stores artifact on ctx.artifacts", async () => {
    const artifacts = createCapabilityArtifactStore()
    const out = (await capability("@executioncontrolprotocol/image-sharp.transform")(
      {
        image: bufferImage,
        pipeline: [{ op: "resize", width: 2, height: 2, fit: "fill" }],
        output: { format: "png" },
      },
      makeCtx(artifacts)
    )) as {
      image: { kind: string; uri: string; mediaType?: string }
      info: { width: number; height: number }
    }
    expect(out.image.kind).toBe("artifact")
    expect(out.info.width).toBe(2)
    expect(out.info.height).toBe(2)
    const stored = artifacts.get(out.image.uri)
    expect(stored?.mediaType).toBe("image/png")
    expect(stored?.size).toBeGreaterThan(0)
  })

  it("derive produces named variants", async () => {
    const out = (await capability("@executioncontrolprotocol/image-sharp.derive")(
      {
        image: bufferImage,
        variants: [
          { name: "small", pipeline: [{ op: "resize", width: 2, height: 2 }] },
          { name: "tiny", pipeline: [{ op: "resize", width: 1, height: 1 }] },
        ],
      },
      makeCtx()
    )) as { variants: Record<string, unknown> }
    expect(Object.keys(out.variants)).toEqual(["small", "tiny"])
  })

  it("denies remote URL when allowRemoteUrls is false", async () => {
    await expect(
      capability("@executioncontrolprotocol/image-sharp.transform")(
        {
          image: { kind: "url", url: "https://example.com/x.png" },
          pipeline: [],
        },
        makeCtx()
      )
    ).rejects.toThrow(/Remote URL|allowRemoteUrls/)
  })

  it("rejects non-image media type after resolve", async () => {
    await expect(
      capability("@executioncontrolprotocol/image-sharp.inspect")(
        {
          image: {
            kind: "buffer",
            data: FIXTURE_PNG_BASE64,
            mediaType: "application/pdf",
          },
        },
        makeCtx()
      )
    ).rejects.toThrow(/not allowed/)
  })

  it("rejects non-image media type after resolve", async () => {
    await expect(
      capability("@executioncontrolprotocol/image-sharp.inspect")(
        {
          image: {
            kind: "buffer",
            data: FIXTURE_PNG_BASE64,
            mediaType: "application/pdf",
          },
        },
        makeCtx()
      )
    ).rejects.toThrow(/not allowed/)
  })

  it("resolves ecp://browser file refs via ctx.blobs through core media", async () => {
    const { createCapabilityBlobStore, stashCapabilityBlob } = await import(
      "@executioncontrolprotocol/core"
    )
    const blobs = createCapabilityBlobStore()
    const png = Buffer.from(FIXTURE_PNG_BASE64, "base64")
    const locator = stashCapabilityBlob(blobs, {
      name: "in.png",
      type: "image/png",
      size: png.length,
      arrayBuffer: async () =>
        png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer,
    })
    const artifacts = createCapabilityArtifactStore()
    const out = (await capability("@executioncontrolprotocol/image-sharp.inspect")(
      { image: { kind: "file", path: locator }, include: ["metadata"] },
      { ...makeCtx(artifacts), blobs }
    )) as { metadata: { width?: number } }
    expect(out.metadata.width).toBe(1)
  })
})
