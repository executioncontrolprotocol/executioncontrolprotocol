import { environment, extension, env, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import { azureBlobStorageExtension } from "@executioncontrolprotocol/plugin-azure-blob-storage"
import { adobeFireflyServicesExtension } from "@executioncontrolprotocol/adobe-firefly-services"

/**
 * Azure Blob + Adobe Firefly Image5 asset pipeline.
 *
 * Env (local smoke):
 * - AZURE_STORAGE_CONNECTION_STRING
 * - AZURE_BLOB_CONTAINER (optional, default artifacts)
 * - ADOBE_CLIENT_ID / ADOBE_CLIENT_SECRET
 *
 * Or bind secrets("azure-blob-storage/connection-string") and
 * secrets("adobe-firefly-services/client-id|client-secret") via the secrets extension.
 */
export default environment(NODE_ENVIRONMENT_ID, "azure-adobe-assets").with([
  extension(azureBlobStorageExtension, "Azure Blob").with({
    connectionString: env("AZURE_STORAGE_CONNECTION_STRING"),
    defaultContainer: "artifacts",
    defaultSasExpiresInSeconds: 3600,
  }),
  extension(adobeFireflyServicesExtension, "Adobe Firefly").with({
    clientId: env("ADOBE_CLIENT_ID"),
    clientSecret: env("ADOBE_CLIENT_SECRET"),
  }),
])
