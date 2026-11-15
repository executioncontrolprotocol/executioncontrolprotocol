import { handleMixedUpload } from "./capabilities/upload-mixed.js"
import { buildAzureBlobCapabilities } from "./capability-catalog.js"
import { buildAzureBlobStorageExtension, HOST_HOP_MESSAGE } from "./shared.js"

async function hostHop(): Promise<never> {
  throw new Error(HOST_HOP_MESSAGE)
}

/**
 * Browser catalog: mixed `upload` PUTs from the tab; SAS/download hop to the host.
 * Does not import `@azure/storage-blob` or `node:fs`.
 * @category Extensions
 */
export const azureBlobStorageExtension = buildAzureBlobStorageExtension(
  buildAzureBlobCapabilities({
    upload: async (input, ctx) => handleMixedUpload(input, ctx),
    createSasUrl: hostHop,
    download: hostHop,
  }),
)

export { uploadInputSchema, uploadOutputSchema } from "./capabilities/upload-schema.js"
export { handleMixedUpload } from "./capabilities/upload-mixed.js"
export {
  createSasUrlInputSchema,
  createSasUrlOutputSchema,
} from "./capabilities/create-sas-url-schema.js"
export { downloadInputSchema, downloadOutputSchema } from "./capabilities/download-schema.js"
export { SAS_PERMISSION_CHARS } from "./permissions.js"
export type { SasPermissionChar } from "./permissions.js"
export default azureBlobStorageExtension
