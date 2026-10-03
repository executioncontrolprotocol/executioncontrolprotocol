import "@executioncontrolprotocol/azure-blob-storage"
import "@executioncontrolprotocol/adobe-firefly-services"
import { environment, extension, env } from "@executioncontrolprotocol/node"
import { registerAzureBlobStorageExtension } from "@executioncontrolprotocol/azure-blob-storage"
import { registerAdobeFireflyServicesExtension } from "@executioncontrolprotocol/adobe-firefly-services"

registerAzureBlobStorageExtension()
registerAdobeFireflyServicesExtension()

/**
 * Azure Blob + Adobe Photoshop generate-manifest host env.
 *
 * Mount for browser demo pairing:
 *   ecp up --env environment.ts --open-url http://localhost:5173/
 *
 * Env (local smoke):
 * - AZURE_STORAGE_CONNECTION_STRING
 * - ADOBE_CLIENT_ID / ADOBE_CLIENT_SECRET
 */
export default environment("azure-photoshop-manifest", "Azure Blob + Photoshop manifest")
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
