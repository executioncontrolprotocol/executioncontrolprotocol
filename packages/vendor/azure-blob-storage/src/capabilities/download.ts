import { z } from "zod"
import {
  writeMediaArtifact,
  type FileCapabilityContext,
} from "@executioncontrolprotocol/core"
import {
  createAzureBlobCredentials,
  readAzureConfig,
  resolveContainer,
} from "../client.js"
import { downloadInputSchema, downloadOutputSchema } from "./download-schema.js"

export { downloadInputSchema, downloadOutputSchema }

/**
 * Download a blob and store bytes via core {@link writeMediaArtifact}.
 * @category Azure
 */
export async function handleDownload(
  input: unknown,
  ctx: unknown,
): Promise<z.infer<typeof downloadOutputSchema>> {
  const parsed = downloadInputSchema.parse(input)
  const fileCtx = ctx as FileCapabilityContext
  const credentials = createAzureBlobCredentials(readAzureConfig(fileCtx))
  const container = resolveContainer(credentials, parsed.container)
  const blob = credentials.client.getContainerClient(container).getBlobClient(parsed.blobName)
  const download = await blob.download()
  const chunks: Buffer[] = []
  if (!download.readableStreamBody) {
    throw new Error(`Azure blob download returned no body for ${parsed.blobName}`)
  }
  for await (const chunk of download.readableStreamBody) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const buffer = Buffer.concat(chunks)
  const contentType = download.contentType ?? "application/octet-stream"
  const file = await writeMediaArtifact(new Uint8Array(buffer), {
    mediaType: contentType,
    name: parsed.blobName,
    prefix: "artifacts/azure-blob",
  }, fileCtx)
  return downloadOutputSchema.parse({
    file,
    contentType,
    blobName: parsed.blobName,
  })
}
