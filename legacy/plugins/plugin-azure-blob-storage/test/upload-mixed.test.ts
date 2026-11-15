import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createCapabilityBlobStore,
  stashCapabilityBlob,
  type CapabilityContext,
} from "@executioncontrolprotocol/core"
import {
  azureBlobStorageExtension,
  handleUpload,
  uploadInputSchema,
} from "../src/index.js"

describe("@executioncontrolprotocol/azure-blob-storage upload", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("declares mixed upload and host SAS/download", () => {
    const byName = Object.fromEntries(
      azureBlobStorageExtension.capabilities.map((cap) => [cap.name, cap.execution])
    )
    expect(byName.upload).toBe("mixed")
    expect(byName["create-sas-url"]).toBe("host")
    expect(byName.download).toBe("host")
  })

  it("accepts a browser locator as the single source", () => {
    const parsed = uploadInputSchema.safeParse({
      source: "ecp://browser/abc",
      container: "assets",
    })
    expect(parsed.success).toBe(true)
  })

  it("rejects multiple sources", () => {
    const parsed = uploadInputSchema.safeParse({
      filePath: "./photo.png",
      sourceUrl: "https://example.com/photo.png",
    })
    expect(parsed.success).toBe(false)
  })

  it("PUTs a stashed File after hopping create-sas-url", async () => {
    const store = createCapabilityBlobStore()
    const locator = stashCapabilityBlob(store, {
      name: "photo.png",
      type: "image/png",
      size: 3,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })
    const call = vi.fn().mockResolvedValue({
      sasUrl: "https://acct.blob.core.windows.net/assets/n?sig=w",
      container: "assets",
    })
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })))
    const ctx = {
      blobs: store,
      capabilities: { call },
    } as unknown as CapabilityContext
    const out = await handleUpload({ source: locator, container: "assets" }, ctx)
    expect(out.blobUrl).toBe("https://acct.blob.core.windows.net/assets/n")
    expect(call).toHaveBeenCalledWith(
      "@executioncontrolprotocol/azure-blob-storage.create-sas-url",
      expect.objectContaining({ permissions: ["c", "w"] })
    )
    expect(global.fetch).toHaveBeenCalled()
  })

  it("createReadSas hops a second create-sas-url with read permissions", async () => {
    const store = createCapabilityBlobStore()
    const locator = stashCapabilityBlob(store, {
      name: "photo.png",
      type: "image/png",
      size: 3,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })
    const call = vi
      .fn()
      .mockResolvedValueOnce({
        sasUrl: "https://acct.blob.core.windows.net/assets/n?sig=w",
        container: "assets",
      })
      .mockResolvedValueOnce({
        sasUrl: "https://acct.blob.core.windows.net/assets/n?sig=r",
      })
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })))
    const ctx = {
      blobs: store,
      capabilities: { call },
    } as unknown as CapabilityContext
    const out = await handleUpload(
      { source: locator, container: "assets", blobName: "n", createReadSas: true },
      ctx,
    )
    expect(out.sasUrl).toBe("https://acct.blob.core.windows.net/assets/n?sig=r")
    expect(call).toHaveBeenNthCalledWith(
      1,
      "@executioncontrolprotocol/azure-blob-storage.create-sas-url",
      expect.objectContaining({ permissions: ["c", "w"] }),
    )
    expect(call).toHaveBeenNthCalledWith(
      2,
      "@executioncontrolprotocol/azure-blob-storage.create-sas-url",
      expect.objectContaining({ permissions: ["r"] }),
    )
  })
})
