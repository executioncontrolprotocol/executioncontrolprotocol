import { describe, expect, it, vi, afterEach } from "vitest"
import {
  createCapabilityBlobStore,
  handleMixedBrowserBlobUpload,
  stashCapabilityBlob,
  type CapabilityContext,
} from "../src/index.js"

describe("handleMixedBrowserBlobUpload", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("PUTs the stashed file to the write SAS from a nested hop", async () => {
    const store = createCapabilityBlobStore()
    const locator = stashCapabilityBlob(store, {
      name: "photo.png",
      type: "image/png",
      size: 3,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })
    const call = vi
      .fn()
      .mockResolvedValueOnce({ sasUrl: "https://acct.blob.core.windows.net/c/n?sig=w" })
      .mockResolvedValueOnce({ sasUrl: "https://acct.blob.core.windows.net/c/n?sig=r" })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true }))
    )
    const ctx = {
      blobs: store,
      capabilities: { call },
    } as unknown as CapabilityContext
    const out = await handleMixedBrowserBlobUpload(
      { source: locator, container: "c", createReadSas: true },
      ctx,
      "@executioncontrolprotocol/azure-blob-storage.create-sas-url"
    )
    expect(out.blobUrl).toBe("https://acct.blob.core.windows.net/c/n")
    expect(out.sasUrl).toContain("sig=r")
    expect(call).toHaveBeenCalledTimes(2)
    expect(global.fetch).toHaveBeenCalled()
  })

  it("omits read SAS when createReadSas is not set", async () => {
    const store = createCapabilityBlobStore()
    const locator = stashCapabilityBlob(store, {
      name: "photo.png",
      type: "image/png",
      size: 3,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })
    const call = vi.fn().mockResolvedValue({
      sasUrl: "https://acct.blob.core.windows.net/c/n?sig=w",
    })
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })))
    const ctx = {
      blobs: store,
      capabilities: { call },
    } as unknown as CapabilityContext
    const out = await handleMixedBrowserBlobUpload(
      { source: locator, container: "c" },
      ctx,
      "@executioncontrolprotocol/azure-blob-storage.create-sas-url"
    )
    expect(out.sasUrl).toBeUndefined()
    expect(call).toHaveBeenCalledTimes(1)
  })

  it("fails when Azure PUT is not ok", async () => {
    const store = createCapabilityBlobStore()
    const locator = stashCapabilityBlob(store, {
      name: "photo.png",
      type: "image/png",
      size: 1,
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    })
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403 })))
    const ctx = {
      blobs: store,
      capabilities: {
        call: async () => ({ sasUrl: "https://acct.blob.core.windows.net/c/n?sig=w" }),
      },
    } as unknown as CapabilityContext
    await expect(
      handleMixedBrowserBlobUpload(
        { source: locator },
        ctx,
        "@executioncontrolprotocol/azure-blob-storage.create-sas-url"
      )
    ).rejects.toThrow(/Azure PUT failed \(403\)/)
  })

  it("fails when the locator is not stashed", async () => {
    const ctx = {
      blobs: createCapabilityBlobStore(),
      capabilities: { call: async () => ({}) },
    } as unknown as CapabilityContext
    await expect(
      handleMixedBrowserBlobUpload(
        { source: "ecp://browser/missing" },
        ctx,
        "@executioncontrolprotocol/azure-blob-storage.create-sas-url"
      )
    ).rejects.toThrow(/No file stashed/)
  })

  it("rejects filesystem paths (CLI path is Node upload)", async () => {
    const ctx = {
      blobs: createCapabilityBlobStore(),
      capabilities: { call: async () => ({}) },
    } as unknown as CapabilityContext
    await expect(
      handleMixedBrowserBlobUpload(
        { filePath: "./photo.png" },
        ctx,
        "@executioncontrolprotocol/azure-blob-storage.create-sas-url"
      )
    ).rejects.toThrow(/ecp:\/\/browser/)
  })
})
