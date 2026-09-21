import { defineExtension, type CapabilityDefinition, type ExtensionDefinition } from "@executioncontrolprotocol/core"
import { z } from "zod"

/** Extension id. @category Azure */
export const EXT_ID = "@executioncontrolprotocol/azure-blob-storage"

/** Thrown if a host Azure handler is invoked in the browser catalog (dispatch should hop first). @category Azure */
export const HOST_HOP_MESSAGE =
  "Capability requires a local host. Start `ecp up --env …`."

/**
 * Build the Azure Blob Storage extension from a capability list.
 * @category Azure
 */
export function buildAzureBlobStorageExtension(
  capabilities: CapabilityDefinition[],
): ExtensionDefinition {
  return defineExtension("@executioncontrolprotocol", "azure-blob-storage")
    .withConfig({
      /** Full Azure Storage connection string. */
      connectionString: z.string().optional(),
      /** Storage account name (with accountKey). */
      accountName: z.string().optional(),
      /** Storage account key (with accountName). */
      accountKey: z.string().optional(),
      /** Default container when capability input omits container. */
      defaultContainer: z.string().optional(),
      /** Default SAS lifetime in seconds (default 3600). */
      defaultSasExpiresInSeconds: z.number().int().positive().optional(),
    })
    .withMetadata({
      summary: "Upload, download, and mint SAS URLs for Azure Blob Storage",
      description:
        "Host-backed blob storage for workflows that persist media, share time-limited read links, or fetch objects into artifacts. Supports connection-string or account key credentials and mixed browser upload via SAS.",
      useCases: [
        "Store generated media in Azure for later workflow steps",
        "Mint read-only SAS URLs for external services that fetch by URL",
        "Download blobs into local artifacts for processing",
      ],
      samplePrompts: [
        "Upload this file to Azure Blob Storage",
        "Create a read-only SAS URL for the uploaded blob",
      ],
    })
    .withCapabilities(capabilities)
    .build()
}
