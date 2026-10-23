import {
  capabilityFor,
  type CapabilityDefinition,
  type CapabilityHandler
} from "@executioncontrolprotocol/core"
import { uploadInputSchema, uploadOutputSchema } from "./capabilities/upload-schema.js"
import {
  createSasUrlInputSchema,
  createSasUrlOutputSchema
} from "./capabilities/create-sas-url-schema.js"
import { downloadInputSchema, downloadOutputSchema } from "./capabilities/download-schema.js"
import { EXT_ID } from "./shared.js"

/** Handlers for Azure Blob capabilities (Node vs browser). @category Extensions */
export interface AzureBlobCapabilityHandlers {
  upload: CapabilityHandler
  createSasUrl: CapabilityHandler
  download: CapabilityHandler
}

/**
 * Shared capability shells (schemas + colocated metadata + execution). Host/browser only swap handlers.
 * @category Extensions
 */
export function buildAzureBlobCapabilities(
  handlers: AzureBlobCapabilityHandlers,
): CapabilityDefinition[] {
  return [
    capabilityFor(EXT_ID, "upload")
      .withInput(uploadInputSchema)
      .withOutput(uploadOutputSchema)
      .withExecution("mixed")
      .withMetadata({
        summary: "Upload bytes or a file reference to a blob",
        description:
          "Writes content to a named blob in a container from a base64 payload, local path, artifact locator, or browser file reference. Returns the blob location and optional SAS URL.",
        useCases: [
          "Persist workflow output to durable cloud storage",
          "Stage user uploads before downstream processing",
        ],
        projections: [
          {
            summary: "Keep the blob location",
            description:
              "Save the container and blob name (and SAS URL if returned) for later download or sharing.",
          },
        ],
      })
      .withHandler(handlers.upload),
    capabilityFor(EXT_ID, "create-sas-url")
      .withInput(createSasUrlInputSchema)
      .withOutput(createSasUrlOutputSchema)
      .withExecution("host")
      .withMetadata({
        summary: "Mint a time-limited SAS URL for a blob",
        description:
          "Generates a shared-access signature URL with chosen read, write, or delete permissions and expiry for an existing blob in a container.",
        useCases: [
          "Share a temporary read link with an external API",
          "Authorize a browser PUT for mixed upload flows",
        ],
        projections: [
          {
            summary: "Share the temporary URL",
            description:
              "Give the SAS URL to the caller or external API that needs time-limited access.",
          },
        ],
      })
      .withHandler(handlers.createSasUrl),
    capabilityFor(EXT_ID, "download")
      .withInput(downloadInputSchema)
      .withOutput(downloadOutputSchema)
      .withExecution("host")
      .withMetadata({
        summary: "Download a blob into a workflow artifact",
        description:
          "Fetches blob bytes from Azure Storage and stores them as a media artifact with content type and name for local processing.",
        useCases: [
          "Pull stored assets back into a workflow for editing",
          "Retrieve remote blobs for inspection or transformation",
        ],
        projections: [
          {
            summary: "Use the downloaded artifact",
            description:
              "Pass the returned media artifact into image or file steps that need local bytes.",
          },
        ],
      })
      .withHandler(handlers.download)
  ]
}
