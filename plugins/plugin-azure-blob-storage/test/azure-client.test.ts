import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createSas, createServiceClient, downloadBytes, uploadBytes } from "../src/azure-client.js"
import type { AzureBlobConfig } from "../src/schemas.js"

// A local stand-in for the Blob REST endpoint: enough of Put Blob and Get Blob for the SDK.
const ACCOUNT = "devacct"
const KEY = Buffer.from("not-a-real-account-key-for-tests").toString("base64")

interface StoredBlob {
  bytes: Buffer
  contentType?: string
}

const blobs = new Map<string, StoredBlob>()
let server: Server
let connectionString: string

function readRequest(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks)))
    req.on("error", reject)
  })
}

function commonHeaders(): Record<string, string> {
  return {
    etag: '"0x1"',
    "last-modified": new Date(0).toUTCString(),
    "x-ms-request-id": "req-1",
    "x-ms-version": "2025-01-05",
  }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname)
  const key = path.replace(`/${ACCOUNT}/`, "")
  if (key.endsWith("/slow")) return
  if (req.method === "PUT") {
    const bytes = await readRequest(req)
    const contentType = req.headers["x-ms-blob-content-type"]
    blobs.set(key, { bytes, ...(typeof contentType === "string" ? { contentType } : {}) })
    res.writeHead(201, { ...commonHeaders(), "content-length": "0" })
    res.end()
    return
  }
  if (req.method === "GET") {
    const blob = blobs.get(key)
    if (!blob) {
      const body = '<?xml version="1.0" encoding="utf-8"?><Error><Code>BlobNotFound</Code><Message>The specified blob does not exist.</Message></Error>'
      res.writeHead(404, {
        ...commonHeaders(),
        "x-ms-error-code": "BlobNotFound",
        "content-type": "application/xml",
        "content-length": String(Buffer.byteLength(body)),
      })
      res.end(body)
      return
    }
    res.writeHead(200, {
      ...commonHeaders(),
      "x-ms-blob-type": "BlockBlob",
      "content-length": String(blob.bytes.byteLength),
      ...(blob.contentType ? { "content-type": blob.contentType } : {}),
    })
    res.end(blob.bytes)
    return
  }
  res.writeHead(405, { "content-length": "0" })
  res.end()
}

beforeAll(async () => {
  server = createServer((req, res) => {
    void handle(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  connectionString = `DefaultEndpointsProtocol=http;AccountName=${ACCOUNT};AccountKey=${KEY};BlobEndpoint=http://127.0.0.1:${port}/${ACCOUNT};`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(() => {
  blobs.clear()
})

function config(): AzureBlobConfig {
  return { connectionString }
}

describe("azure-client upload and download", () => {
  it("uploads bytes with a content type and downloads them back", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])

    const { blobUrl } = await uploadBytes(config(), {
      container: "ecp",
      blobName: "dir/product.png",
      bytes,
      contentType: "image/png",
    })

    expect(blobUrl).toMatch(/\/devacct\/ecp\/dir\/product\.png$/)
    expect(blobs.get("ecp/dir/product.png")).toEqual({ bytes: Buffer.from(bytes), contentType: "image/png" })

    const downloaded = await downloadBytes(config(), { container: "ecp", blobName: "dir/product.png" })
    expect(Array.from(downloaded.bytes)).toEqual([1, 2, 3, 4, 5])
    expect(downloaded.contentType).toBe("image/png")
  })

  it("downloads an empty blob without a content type", async () => {
    blobs.set("ecp/empty", { bytes: Buffer.alloc(0) })

    const downloaded = await downloadBytes(config(), { container: "ecp", blobName: "empty" })

    expect(downloaded.bytes.byteLength).toBe(0)
    expect(downloaded).not.toHaveProperty("contentType")
  })

  it("maps a missing blob to ECP_PROVIDER_ERROR with status 404", async () => {
    await expect(downloadBytes(config(), { container: "ecp", blobName: "missing.png" })).rejects.toMatchObject({
      code: "ECP_PROVIDER_ERROR",
      message: expect.stringContaining("ecp/missing.png"),
      details: { status: 404, azureCode: "BlobNotFound" },
    })
  })

  it("rejects an upload when the signal aborts mid-request", async () => {
    const controller = new AbortController()
    const pending = uploadBytes(config(), {
      container: "ecp",
      blobName: "slow",
      bytes: new Uint8Array([1]),
      contentType: "application/octet-stream",
      signal: controller.signal,
    })
    setTimeout(() => controller.abort(), 20)

    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  })

  it("rejects a download when the signal is already aborted", async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      downloadBytes(config(), { container: "ecp", blobName: "slow", signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" })
  })
})

describe("azure-client createSas", () => {
  it("signs a read URL from a connection string", async () => {
    const before = Date.now()

    const { sasUrl, expiresOn } = await createSas(config(), {
      container: "ecp",
      blobName: "product.png",
      permissions: "r",
      expiresInSeconds: 600,
    })

    const url = new URL(sasUrl)
    expect(url.pathname).toBe(`/${ACCOUNT}/ecp/product.png`)
    expect(url.searchParams.get("sp")).toBe("r")
    expect(url.searchParams.get("sr")).toBe("b")
    expect(url.searchParams.get("spr")).toBe("https,http")
    expect(url.searchParams.get("sig")).toBeTruthy()
    const expiry = Date.parse(expiresOn)
    expect(expiry).toBeGreaterThanOrEqual(before + 600_000)
    expect(expiry).toBeLessThan(before + 600_000 + 5_000)
    expect(url.searchParams.get("se")).toBe(expiresOn.replace(/\.\d{3}Z$/, "Z"))
  })

  it("signs an https-only URL from an account name and key", async () => {
    const { sasUrl } = await createSas(
      { accountName: "acct", accountKey: KEY },
      { container: "drop", blobName: "out.png", permissions: "cw", expiresInSeconds: 60 },
    )

    const url = new URL(sasUrl)
    expect(url.origin).toBe("https://acct.blob.core.windows.net")
    expect(url.pathname).toBe("/drop/out.png")
    expect(url.searchParams.get("sp")).toBe("cw")
    expect(url.searchParams.get("spr")).toBe("https")
  })

  it("fails with ECP_CONFIG_INVALID when the connection string has no account key", async () => {
    const sasOnly = "BlobEndpoint=https://acct.blob.core.windows.net/;SharedAccessSignature=sv=2025-01-05&ss=b&srt=o&sp=r&se=2099-01-01T00:00:00Z&sig=abc"

    await expect(
      createSas({ connectionString: sasOnly }, { container: "ecp", blobName: "b", permissions: "r", expiresInSeconds: 60 }),
    ).rejects.toMatchObject({ code: "ECP_CONFIG_INVALID" })
  })

  it("builds the account endpoint for account-key config", () => {
    expect(createServiceClient({ accountName: "acct", accountKey: KEY }).url).toBe(
      "https://acct.blob.core.windows.net/",
    )
  })
})
