import { environment, extension, env, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import { azureBlobStorageExtension } from "@executioncontrolprotocol/azure-blob-storage"
import { adobeFireflyServicesExtension } from "@executioncontrolprotocol/adobe-firefly-services"

/**
 * Azure Blob + Adobe Photoshop generate-manifest host env.
 *
 * Env (local smoke):
 * - AZURE_STORAGE_CONNECTION_STRING
 * - ADOBE_CLIENT_ID / ADOBE_CLIENT_SECRET
 */
export default environment(NODE_ENVIRONMENT_ID, "azure-photoshop-manifest").with([
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
