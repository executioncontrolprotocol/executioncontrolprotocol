import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { globalRegistry } from "@executioncontrolprotocol/core"

const uploadData = vi.fn()
const download = vi.fn()
const generateBlobSASQueryParameters = vi.fn()

vi.mock("@azure/storage-blob", () => {
  class StorageSharedKeyCredential {
    constructor(
      public accountName: string,
      public accountKey: string,
    ) {}
  }

  class BlobServiceClient {
    accountName: string
    constructor(
      public url: string,
      _cred?: unknown,
    ) {
      this.accountName = "testaccount"
    }
    static fromConnectionString(cs: string) {
      const name = /AccountName=([^;]+)/i.exec(cs)?.[1] ?? "fromcs"
      const client = new BlobServiceClient(`https://${name}.blob.core.windows.net`)
      client.accountName = name
      return client
    }
    getContainerClient(container: string) {
      return {
        getBlobClient: (blobName: string) => ({
          url: `https://testaccount.blob.core.windows.net/${container}/${blobName}`,
          download: (...args: unknown[]) => download(...args),
        }),
        getBlockBlobClient: (blobName: string) => ({
          url: `https://testaccount.blob.core.windows.net/${container}/${blobName}`,
          uploadData: (...args: unknown[]) => uploadData(...args),
        }),
      }
    }
  }

  return {
    BlobServiceClient,
    StorageSharedKeyCredential,
    BlobSASPermissions: {
      parse: (s: string) => ({ toString: () => s }),
    },
    SASProtocol: { Https: "https" },
    generateBlobSASQueryParameters: (...args: unknown[]) =>
      generateBlobSASQueryParameters(...args),
  }
})

const {
  azureBlobStorageExtension,
  registerAzureBlobStorageExtension,
  createAzureBlobCredentials,
  createBlobSasUrl,
  parseAccountKeyFromConnectionString,
} = await import("../src/index.js")

type Handler = (input: unknown, ctx: unknown) => Promise<unknown>

function capability(id: string): Handler {
  const cap = azureBlobStorageExtension.capabilities.find((c) => c.id === id)
  if (!cap) throw new Error(`missing ${id}`)
  return cap.handler as Handler
}

const ctx = {
  extensionConfig: {
    accountName: "testaccount",
    accountKey: "dGVzdGtleQ==",
    defaultContainer: "artifacts",
  },
  artifacts: new Map(),
}

describe("@executioncontrolprotocol/azure-blob-storage", () => {
  beforeEach(async () => {
    await registerAzureBlobStorageExtension()
    uploadData.mockReset()
    download.mockReset()
    generateBlobSASQueryParameters.mockReset()
    uploadData.mockResolvedValue({ etag: '"etag-1"' })
    generateBlobSASQueryParameters.mockReturnValue({
      toString: () => "sv=2024&sig=fake",
    })
    ctx.artifacts = new Map()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("registers upload, create-sas-url, and download", () => {
    const ext = globalRegistry.getExtension("@executioncontrolprotocol/azure-blob-storage")
    expect(ext).toBe(azureBlobStorageExtension)
    const ids = ext?.capabilities.map((c) => c.id) ?? []
    expect(ids).toEqual([
      "@executioncontrolprotocol/azure-blob-storage.upload",
      "@executioncontrolprotocol/azure-blob-storage.create-sas-url",
      "@executioncontrolprotocol/azure-blob-storage.download",
    ])
  })

  it("upload rejects when no source is provided", () => {
    const cap = azureBlobStorageExtension.capabilities.find(
      (c) => c.id === "@executioncontrolprotocol/azure-blob-storage.upload",
    )
    expect(cap?.inputSchema?.safeParse({}).success).toBe(false)
  })

  it("upload with contentBase64 returns blobUrl and optional sasUrl", async () => {
    const out = (await capability("@executioncontrolprotocol/azure-blob-storage.upload")(
      {
        contentBase64: Buffer.from("hello").toString("base64"),
        contentType: "text/plain",
        blobName: "hello.txt",
        createReadSas: true,
      },
      ctx,
    )) as {
      blobUrl: string
      sasUrl?: string
      container: string
      blobName: string
      etag?: string
    }

    expect(out.container).toBe("artifacts")
    expect(out.blobName).toBe("hello.txt")
    expect(out.blobUrl).toContain("hello.txt")
    expect(out.etag).toBe('"etag-1"')
    expect(out.sasUrl).toContain("sv=2024&sig=fake")
    expect(uploadData).toHaveBeenCalled()
    expect(generateBlobSASQueryParameters).toHaveBeenCalled()
  })

  it("parses AccountKey from a connection string", () => {
    expect(
      parseAccountKeyFromConnectionString(
        "DefaultEndpointsProtocol=https;AccountName=acct;AccountKey=abc123==;EndpointSuffix=core.windows.net",
      ),
    ).toBe("abc123==")
    expect(parseAccountKeyFromConnectionString("AccountName=acct;EndpointSuffix=core.windows.net")).toBe(
      undefined,
    )
  })

  it("connectionString config yields sharedKey for SAS", () => {
    const credentials = createAzureBlobCredentials({
      connectionString:
        "DefaultEndpointsProtocol=https;AccountName=fromcs;AccountKey=dGVzdGtleQ==;EndpointSuffix=core.windows.net",
      defaultContainer: "artifacts",
    })
    expect(credentials.accountName).toBe("fromcs")
    expect(credentials.sharedKey).toBeDefined()
    const sas = createBlobSasUrl({
      credentials,
      container: "artifacts",
      blobName: "x.bin",
      permissions: ["r"],
      expiresInSeconds: 60,
    })
    expect(sas.sasUrl).toContain("sig=fake")
  })

  it("rejects SAS when connectionString has no AccountKey", () => {
    const credentials = createAzureBlobCredentials({
      connectionString:
        "DefaultEndpointsProtocol=https;AccountName=fromcs;EndpointSuffix=core.windows.net",
      defaultContainer: "artifacts",
    })
    expect(credentials.sharedKey).toBeUndefined()
    expect(() =>
      createBlobSasUrl({
        credentials,
        container: "artifacts",
        blobName: "x.bin",
        permissions: ["r"],
        expiresInSeconds: 60,
      }),
    ).toThrow(/account key/i)
  })

  it("upload from sourceUrl uses resolveFile fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: { get: (h: string) => (h === "content-type" ? "image/png" : null) },
        arrayBuffer: async () => new Uint8Array([9, 9]).buffer,
      })),
    )
    const out = (await capability("@executioncontrolprotocol/azure-blob-storage.upload")(
      {
        sourceUrl: "https://example.com/photo.png",
        blobName: "photo.png",
      },
      ctx,
    )) as { blobName: string; contentType: string }

    expect(out.blobName).toBe("photo.png")
    expect(out.contentType).toBe("image/png")
    expect(uploadData).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        blobHTTPHeaders: { blobContentType: "image/png" },
      }),
    )
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com/photo.png",
      expect.anything(),
    )
  })

  it("upload from filePath reads local bytes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "azure-blob-"))
    const filePath = join(dir, "local.txt")
    await writeFile(filePath, "from-disk")

    const out = (await capability("@executioncontrolprotocol/azure-blob-storage.upload")(
      {
        filePath,
        contentType: "text/plain",
        blobName: "local.txt",
      },
      ctx,
    )) as { blobName: string; contentType: string }

    expect(out.blobName).toBe("local.txt")
    expect(out.contentType).toBe("text/plain")
    const [buffer] = uploadData.mock.calls[0] as [Buffer]
    expect(buffer.toString("utf8")).toBe("from-disk")
  })

  it("create-sas-url returns expiresAt and permissions", async () => {
    const out = (await capability(
      "@executioncontrolprotocol/azure-blob-storage.create-sas-url",
    )(
      {
        blobName: "img.png",
        permissions: ["r", "w"],
        expiresInSeconds: 600,
      },
      ctx,
    )) as { sasUrl: string; expiresAt: string; permissions: string }

    expect(out.permissions).toBe("rw")
    expect(out.sasUrl).toContain("sig=fake")
    expect(Date.parse(out.expiresAt)).toBeGreaterThan(Date.now())
  })

  it("download writes an artifact FileRef", async () => {
    async function* body() {
      yield Buffer.from("world")
    }
    download.mockResolvedValue({
      readableStreamBody: body(),
      contentType: "text/plain",
    })

    const out = (await capability("@executioncontrolprotocol/azure-blob-storage.download")(
      { blobName: "hello.txt" },
      ctx,
    )) as {
      file: { kind: string; uri: string; mediaType?: string }
      contentType: string
      blobName: string
    }

    expect(out.blobName).toBe("hello.txt")
    expect(out.contentType).toBe("text/plain")
    expect(out.file.kind).toBe("artifact")
    expect(out.file.uri).toContain("hello.txt")
    expect(out.file.mediaType).toBe("text/plain")
    expect(ctx.artifacts.has(out.file.uri)).toBe(true)
  })

  it("throws without credentials", async () => {
    await expect(
      capability("@executioncontrolprotocol/azure-blob-storage.upload")(
        { contentBase64: "YQ==", blobName: "a" },
        { extensionConfig: {}, artifacts: new Map() },
      ),
    ).rejects.toThrow(/connectionString|accountName/)
  })
})
