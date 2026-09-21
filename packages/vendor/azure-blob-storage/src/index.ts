import {
  catalogExtension,
  globalRegistry,
  type Registry,
} from "@executioncontrolprotocol/core"
import { handleUpload } from "./capabilities/upload.js"
import { handleCreateSasUrl } from "./capabilities/create-sas-url.js"
import { handleDownload } from "./capabilities/download.js"
import { buildAzureBlobCapabilities } from "./capability-catalog.js"
import { buildAzureBlobStorageExtension } from "./shared.js"

/**
 * `@executioncontrolprotocol/azure-blob-storage` — Azure Blob upload, SAS, and download.
 *
 * Bind credentials via `secrets("azure-blob-storage/connection-string")` or
 * `accountName` + `accountKey`. Mint read SAS URLs for Adobe Firefly
 * `referenceBlobs` / Photoshop `source.url`.
 *
 * Browser mixed `upload` hops `create-sas-url` then PUTs from the tab. Allow the
 * demo origin on the container CORS policy (`PUT`, `x-ms-blob-type`).
 *
 * @category Extensions
 */
export const azureBlobStorageExtension = buildAzureBlobStorageExtension(
  buildAzureBlobCapabilities({
    upload: async (input, ctx) => handleUpload(input, ctx),
    createSasUrl: async (input, ctx) => handleCreateSasUrl(input, ctx),
    download: async (input, ctx) => handleDownload(input, ctx),
  }),
)

catalogExtension(azureBlobStorageExtension)

/**
 * Register `@executioncontrolprotocol/azure-blob-storage` on a registry.
 *
 * @category Extensions
 */
export async function registerAzureBlobStorageExtension(
  registry: Registry = globalRegistry,
): Promise<void> {
  if (!registry.getExtension("@executioncontrolprotocol/azure-blob-storage")) {
    await registry.registerExtension(azureBlobStorageExtension)
  }
}

export {
  createAzureBlobCredentials,
  parseAccountKeyFromConnectionString,
  readAzureConfig,
  resolveContainer,
} from "./client.js"
export type { AzureBlobStorageConfig, AzureBlobCredentials } from "./client.js"
export { createBlobSasUrl, SAS_PERMISSION_CHARS } from "./sas.js"
export type { SasPermissionChar, CreateBlobSasOptions } from "./sas.js"
export { uploadInputSchema, uploadOutputSchema, handleUpload } from "./capabilities/upload.js"
export {
  createSasUrlInputSchema,
  createSasUrlOutputSchema,
  handleCreateSasUrl,
} from "./capabilities/create-sas-url.js"
export {
  downloadInputSchema,
  downloadOutputSchema,
  handleDownload,
} from "./capabilities/download.js"
export default azureBlobStorageExtension
