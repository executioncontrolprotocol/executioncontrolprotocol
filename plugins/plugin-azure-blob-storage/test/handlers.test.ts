import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ArtifactFileRef, FileRef, HandlerContext } from "@executioncontrolprotocol/plugin-sdk"

vi.mock("../src/azure-client.js", () => ({
  uploadBytes: vi.fn(),
  downloadBytes: vi.fn(),
  createSas: vi.fn(),
  deleteBlob: vi.fn(),
}))

const client = await import("../src/azure-client.js")
const { default: upload } = await import("../src/capabilities/upload.js")
const { default: download } = await import("../src/capabilities/download.js")
const { default: sas } = await import("../src/capabilities/sas.js")
const { default: deleteHandler } = await import("../src/capabilities/delete.js")

const uploadBytes = vi.mocked(client.uploadBytes)
const downloadBytes = vi.mocked(client.downloadBytes)
const createSas = vi.mocked(client.createSas)
const deleteBlob = vi.mocked(client.deleteBlob)

const CONFIG = { connectionString: "UseDevelopmentStorage=true", defaultContainer: "ecp" }
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

function ctx(partial: Partial<HandlerContext> = {}): HandlerContext & { written: Array<{ bytes: Uint8Array; mediaType: string; name?: string }> } {
  const written: Array<{ bytes: Uint8Array; mediaType: string; name?: string }> = []
  return {
    written,
    config: CONFIG,
    signal: new AbortController().signal,
    run: { id: "run-1" },
    step: { id: "step-1" },
    state: Object.freeze({}),
    store: { set() {}, merge() {}, append() {} },
    files: (() => {
      const read = async () => ({ bytes: PNG, mediaType: "image/png", name: "product.png" })
      const fromBytes = async (bytes: Uint8Array, options?: { mediaType?: string; name?: string }): Promise<ArtifactFileRef> => {
        written.push({ bytes, mediaType: options?.mediaType ?? "application/octet-stream", name: options?.name })
        return {
          kind: "artifact",
          uri: `ecp://runs/run-1/artifacts/${options?.name ?? "artifact.bin"}`,
          mediaType: options?.mediaType,
          ...(options?.name === undefined ? {} : { name: options.name }),
          sizeBytes: bytes.byteLength,
        }
      }
      return {
        read,
        bytes: read,
        stream: async () => ({
          stream: new ReadableStream(),
          async cancel() {},
        }),
        path: async () => ({ path: "/abs/product.png", temporary: false }),
        url: async (ref: { kind: "url"; url: string }) => ref,
        fromBytes,
        fromStream: async (stream: ReadableStream<Uint8Array>, options?: { mediaType?: string; name?: string }) => {
          const reader = stream.getReader()
          const { value } = await reader.read()
          return fromBytes(value ?? new Uint8Array(), options)
        },
        fromPath: async () => ({ kind: "artifact" as const, uri: "ecp://runs/run-1/artifacts/x" }),
        fromUrl: async (url: string) => ({ kind: "url" as const, url }),
        writeArtifact: (bytes: Uint8Array, options: { mediaType: string; name?: string }) => fromBytes(bytes, options),
      }
    })(),
    async call() {
      return undefined
    },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    usage: { record() {} },
    ...partial,
  }
}

beforeEach(() => {
  uploadBytes.mockReset()
  downloadBytes.mockReset()
  createSas.mockReset()
  deleteBlob.mockReset()
  uploadBytes.mockImplementation(async (_config, options) => ({
    blobUrl: `https://acct.blob.core.windows.net/${options.container}/${options.blobName}`,
  }))
  createSas.mockImplementation(async (_config, options) => ({
    sasUrl: `https://acct.blob.core.windows.net/${options.container}/${options.blobName}?sp=${options.permissions}&sig=x`,
    expiresOn: "2026-11-15T17:00:00.000Z",
  }))
})

describe("upload", () => {
  it("reads the file ref, uploads to the default container and mints a read SAS", async () => {
    const file: FileRef = { kind: "file", path: "/abs/product.png", mediaType: "image/png" }
    const context = ctx()

    const result = await upload({ file, blobName: "product.png", createReadSas: true }, context)

    expect(result).toEqual({
      blobName: "product.png",
      container: "ecp",
      file: {
        kind: "url",
        url: "https://acct.blob.core.windows.net/ecp/product.png?sp=r&sig=x",
        mediaType: "image/png",
      },
    })
    expect(uploadBytes).toHaveBeenCalledWith(CONFIG, {
      container: "ecp",
      blobName: "product.png",
      bytes: PNG,
      contentType: "image/png",
      signal: context.signal,
    })
    expect(createSas).toHaveBeenCalledWith(CONFIG, {
      container: "ecp",
      blobName: "product.png",
      permissions: "r",
      expiresInSeconds: 3600,
    })
  })

  it("uses the input container, mints SAS by default, and generates a scoped blob name", async () => {
    const result = await upload(
      { file: { kind: "artifact", uri: "ecp://runs/run-1/artifacts/a.bin", name: "a.bin" }, container: "media", contentType: "text/plain" },
      ctx(),
    )

    expect(result.container).toBe("media")
    expect(result.blobName).toMatch(/^ecp\/run-1\/step-1\/a-[0-9a-f]{8}\.bin$/)
    expect(result.file.kind).toBe("url")
    expect(result.file.url).toContain("?sp=")
    expect(uploadBytes.mock.calls[0]![1].contentType).toBe("text/plain")
    expect(createSas).toHaveBeenCalled()
  })

  it("returns the bare blob URL when createReadSas is false", async () => {
    const result = await upload(
      { file: { kind: "file", path: "/abs/product.png" }, createReadSas: false },
      ctx(),
    )

    expect(result.file.url).toMatch(/^https:\/\/acct\.blob\.core\.windows\.net\/ecp\/[^?]+$/)
    expect(result.file.url).not.toContain("?")
    expect(createSas).not.toHaveBeenCalled()
  })

  it("keeps explicit blobName and generates unique default names per call", async () => {
    const first = await upload({ file: { kind: "file", path: "/abs/a.png" } }, ctx())
    const second = await upload({ file: { kind: "file", path: "/abs/a.png" } }, ctx())
    await upload({ file: { kind: "file", path: "/abs/product.png" }, blobName: "dir/custom.png" }, ctx())

    expect(first.blobName).not.toBe(second.blobName)
    expect(uploadBytes.mock.calls[2]![1].blobName).toBe("dir/custom.png")
  })

  it("falls back to the ref media type, then application/octet-stream", async () => {
    const base = ctx()
    const noMedia = ctx({
      files: {
        ...base.files,
        async bytes() {
          return { bytes: PNG }
        },
        async read() {
          return { bytes: PNG }
        },
      },
    })

    await upload({ file: { kind: "url", url: "https://example.com/a.jpg", mediaType: "image/jpeg" } }, noMedia)
    await upload({ file: { kind: "url", url: "https://example.com/a" } }, noMedia)

    expect(uploadBytes.mock.calls.map(([, options]) => options.contentType)).toEqual([
      "image/jpeg",
      "application/octet-stream",
    ])
  })

  it("surfaces a missing file without uploading", async () => {
    const missing = Object.assign(new Error("ENOENT: no such file or directory, open '/abs/missing.png'"), {
      code: "ENOENT",
    })
    const context = ctx({
      files: {
        bytes: async () => {
          throw missing
        },
        read: async () => {
          throw missing
        },
        async writeArtifact(): Promise<ArtifactFileRef> {
          return { kind: "artifact", uri: "ecp://runs/run-1/artifacts/x" }
        },
      },
    })

    await expect(upload({ file: { kind: "file", path: "/abs/missing.png" } }, context)).rejects.toBe(missing)
    expect(uploadBytes).not.toHaveBeenCalled()
  })

  it("does nothing when the step is already aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    const read = vi.fn()

    await expect(
      upload(
        { file: { kind: "file", path: "/abs/product.png" } },
        ctx({ signal: controller.signal, files: { bytes: read, read, writeArtifact: vi.fn() } }),
      ),
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(read).not.toHaveBeenCalled()
    expect(uploadBytes).not.toHaveBeenCalled()
  })

  it("fails with ECP_CONFIG_INVALID or ECP_INPUT_INVALID before touching Azure", async () => {
    const file: FileRef = { kind: "file", path: "/abs/product.png" }

    await expect(upload({ file }, ctx({ config: { connectionString: "" } }))).rejects.toMatchObject({
      code: "ECP_CONFIG_INVALID",
    })
    await expect(upload({ file }, ctx({ config: { connectionString: "x" } }))).rejects.toMatchObject({
      code: "ECP_INPUT_INVALID",
    })
    expect(uploadBytes).not.toHaveBeenCalled()
  })

  it("propagates provider errors from the client", async () => {
    uploadBytes.mockRejectedValueOnce(Object.assign(new Error("HTTP 403"), { code: "ECP_PROVIDER_ERROR" }))

    await expect(upload({ file: { kind: "file", path: "/abs/a.png" } }, ctx())).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
    })
  })
})

describe("download", () => {
  it("writes the blob as an artifact named after the last blob segment", async () => {
    downloadBytes.mockResolvedValueOnce({ bytes: PNG, contentType: "image/png" })
    const context = ctx()

    const result = await download({ blobName: "renders/2026/product.png" }, context)

    expect(result).toEqual({
      file: {
        kind: "artifact",
        uri: "ecp://runs/run-1/artifacts/product.png",
        mediaType: "image/png",
        name: "product.png",
        sizeBytes: 4,
      },
    })
    expect(downloadBytes).toHaveBeenCalledWith(CONFIG, {
      container: "ecp",
      blobName: "renders/2026/product.png",
      signal: context.signal,
    })
    expect(context.written[0]?.bytes).toBe(PNG)
  })

  it("defaults the media type and names the artifact `blob` when the blob name has no segment", async () => {
    downloadBytes.mockResolvedValueOnce({ bytes: new Uint8Array() })
    const context = ctx()

    const result = await download({ blobName: "/", container: "other" }, context)

    expect(result.file.mediaType).toBe("application/octet-stream")
    expect(result.file.name).toBe("blob")
    expect(result.file.sizeBytes).toBe(0)
    expect(downloadBytes.mock.calls[0]![1].container).toBe("other")
  })

  it("propagates a 404 from the client and writes nothing", async () => {
    downloadBytes.mockRejectedValueOnce(
      Object.assign(new Error("HTTP 404"), { code: "ECP_PROVIDER_ERROR", details: { status: 404 } }),
    )
    const context = ctx()

    await expect(download({ blobName: "missing.png" }, context)).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      details: { status: 404 },
    })
    expect(context.written).toEqual([])
  })
})

describe("delete", () => {
  it("deletes a blob in the default container", async () => {
    deleteBlob.mockResolvedValueOnce({ deleted: true })

    const result = await deleteHandler({ blobName: "psd-layers/run.psd" }, ctx())

    expect(result).toEqual({ blobName: "psd-layers/run.psd", container: "ecp", deleted: true })
    expect(deleteBlob).toHaveBeenCalledWith(CONFIG, {
      container: "ecp",
      blobName: "psd-layers/run.psd",
      ifMissing: "error",
      signal: expect.any(AbortSignal),
    })
  })

  it("returns deleted false when the blob is missing and ifMissing is ignore", async () => {
    deleteBlob.mockResolvedValueOnce({ deleted: false })

    const result = await deleteHandler({ blobName: "gone.psd", ifMissing: "ignore" }, ctx())

    expect(result.deleted).toBe(false)
    expect(deleteBlob.mock.calls[0]![1].ifMissing).toBe("ignore")
  })

  it("surfaces a 404 with provider text and details.body when ifMissing is error", async () => {
    deleteBlob.mockRejectedValueOnce(
      Object.assign(new Error("Azure Blob Storage returned HTTP 404 for ecp/missing.psd: The specified blob does not exist."), {
        code: "ECP_PROVIDER_ERROR",
        details: {
          status: 404,
          azureCode: "BlobNotFound",
          body: { code: "BlobNotFound", message: "The specified blob does not exist." },
        },
      }),
    )

    await expect(deleteHandler({ blobName: "missing.psd" }, ctx())).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      message: expect.stringContaining("The specified blob does not exist"),
      details: {
        status: 404,
        body: { code: "BlobNotFound", message: "The specified blob does not exist." },
      },
    })
  })

  it("uses the input container", async () => {
    deleteBlob.mockResolvedValueOnce({ deleted: true })
    await deleteHandler({ blobName: "a.psd", container: "staging" }, ctx())

    expect(deleteBlob.mock.calls[0]![1].container).toBe("staging")
  })
})

describe("sas", () => {
  it("defaults to read-only for an hour", async () => {
    await expect(sas({ blobName: "product.png" }, ctx())).resolves.toEqual({
      sasUrl: "https://acct.blob.core.windows.net/ecp/product.png?sp=r&sig=x",
      expiresOn: "2026-11-15T17:00:00.000Z",
    })
    expect(createSas).toHaveBeenCalledWith(CONFIG, {
      container: "ecp",
      blobName: "product.png",
      permissions: "r",
      expiresInSeconds: 3600,
    })
  })

  it("passes permissions, lifetime and container through", async () => {
    await sas({ blobName: "out.png", container: "drop", permissions: "cw", expiresInSeconds: 300 }, ctx())

    expect(createSas).toHaveBeenCalledWith(CONFIG, {
      container: "drop",
      blobName: "out.png",
      permissions: "cw",
      expiresInSeconds: 300,
    })
  })

  it("fails without a container", async () => {
    await expect(sas({ blobName: "b" }, ctx({ config: { accountName: "a", accountKey: "k" } }))).rejects.toMatchObject({
      code: "ECP_INPUT_INVALID",
    })
    expect(createSas).not.toHaveBeenCalled()
  })
})
