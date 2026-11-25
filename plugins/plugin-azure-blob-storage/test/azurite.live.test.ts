import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { BlobServiceClient } from "@azure/storage-blob"
import { createSas, deleteBlob, downloadBytes, uploadBytes } from "../src/azure-client.js"

// Runs against Azurite (or a real account) only when a connection string is provided.
const connectionString = process.env.ECP_TEST_AZURE_STORAGE_CONNECTION_STRING

describe.skipIf(!connectionString)("azure-client (live)", () => {
  it("round-trips a blob and fetches it through a read SAS", async () => {
    const config = { connectionString: connectionString! }
    const container = `ecp-test-${randomUUID().slice(0, 8)}`
    const containerClient = BlobServiceClient.fromConnectionString(config.connectionString).getContainerClient(container)
    await containerClient.create()
    try {
      const bytes = new TextEncoder().encode("hello azurite")
      await uploadBytes(config, { container, blobName: "hello.txt", bytes, contentType: "text/plain" })

      const downloaded = await downloadBytes(config, { container, blobName: "hello.txt" })
      expect(new TextDecoder().decode(downloaded.bytes)).toBe("hello azurite")
      expect(downloaded.contentType).toBe("text/plain")

      const { sasUrl } = await createSas(config, { container, blobName: "hello.txt", permissions: "r", expiresInSeconds: 60 })
      const res = await fetch(sasUrl)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe("hello azurite")

      expect(await deleteBlob(config, { container, blobName: "hello.txt", ifMissing: "error" })).toEqual({
        deleted: true,
      })
      await expect(downloadBytes(config, { container, blobName: "hello.txt" })).rejects.toMatchObject({
        code: "ECP_PROVIDER_ERROR",
      })
    } finally {
      await containerClient.deleteIfExists()
    }
  }, 30_000)
})
