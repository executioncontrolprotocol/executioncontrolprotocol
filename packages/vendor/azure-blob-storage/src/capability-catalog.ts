import {
  capabilityFor,
  type CapabilityDefinition,
  type CapabilityHandler,
} from "@executioncontrolprotocol/core"
import { uploadInputSchema, uploadOutputSchema } from "./capabilities/upload-schema.js"
import {
  createSasUrlInputSchema,
  createSasUrlOutputSchema,
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
        samplePrompts: [
          "Upload this image to Azure blobs in the media container",
          "Store the generated file as uploads/report.pdf",
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
        samplePrompts: [
          "Create a read-only SAS URL valid for one hour",
          "Generate a write SAS so the browser can upload the blob",
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
        samplePrompts: [
          "Download the blob exports/data.json from Azure",
          "Fetch the stored image so we can resize it",
        ],
      })
      .withHandler(handlers.download),
  ]
}
