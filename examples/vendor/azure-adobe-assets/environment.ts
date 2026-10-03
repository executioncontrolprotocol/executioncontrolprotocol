import "@executioncontrolprotocol/azure-blob-storage"
import "@executioncontrolprotocol/adobe-firefly-services"
import { environment, extension, env } from "@executioncontrolprotocol/node"
import { registerAzureBlobStorageExtension } from "@executioncontrolprotocol/azure-blob-storage"
import { registerAdobeFireflyServicesExtension } from "@executioncontrolprotocol/adobe-firefly-services"

registerAzureBlobStorageExtension()
registerAdobeFireflyServicesExtension()

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
export default environment("azure-adobe-assets", "Azure Blob + Firefly Image5")
  .withExtensions([
    extension("@executioncontrolprotocol/azure-blob-storage", "Azure Blob").with({
      connectionString: env("AZURE_STORAGE_CONNECTION_STRING"),
      defaultContainer: "artifacts",
      defaultSasExpiresInSeconds: 3600,
    }),
    extension("@executioncontrolprotocol/adobe-firefly-services", "Adobe Firefly").with({
      clientId: env("ADOBE_CLIENT_ID"),
      clientSecret: env("ADOBE_CLIENT_SECRET"),
    }),
  ])
