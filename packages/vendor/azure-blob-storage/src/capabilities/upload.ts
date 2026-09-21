import { z } from "zod"
import {
  FILE_REF_KINDS,
  type FileRef,
} from "@executioncontrolprotocol/types"
import {
  isBrowserFileLocator,
  resolveFile,
  type FileCapabilityContext,
} from "@executioncontrolprotocol/core"
import {
  createAzureBlobCredentials,
  readAzureConfig,
  resolveContainer,
} from "../client.js"
import { createBlobSasUrl } from "../sas.js"
import { handleMixedUpload } from "./upload-mixed.js"
import { uploadInputSchema, uploadOutputSchema } from "./upload-schema.js"

export { uploadInputSchema, uploadOutputSchema }

function locatorFromInput(input: z.infer<typeof uploadInputSchema>): string | undefined {
  if (typeof input.source === "string" && input.source.length > 0) return input.source
  if (typeof input.filePath === "string" && input.filePath.length > 0) return input.filePath
  return undefined
}

/**
 * Map upload capability input to a portable {@link FileRef} for {@link resolveFile}.
 * @category Azure
 */
export function fileRefFromUploadInput(
  input: z.infer<typeof uploadInputSchema>,
): FileRef {
  if (input.contentBase64) {
    return {
      kind: FILE_REF_KINDS.BUFFER,
      data: input.contentBase64,
      mediaType: input.contentType,
    }
  }
  if (input.sourceUrl) {
    return {
      kind: FILE_REF_KINDS.URL,
      url: input.sourceUrl,
      mediaType: input.contentType,
    }
  }
  const path = input.filePath ?? input.source
  if (path) {
    return {
      kind: FILE_REF_KINDS.FILE,
      path,
      mediaType: input.contentType,
    }
  }
  throw new Error("No upload source provided")
}

/**
 * Resolve upload bytes via core {@link resolveFile} (path, URL, or base64).
 * @category Azure
 */
export async function resolveUploadBytes(
  input: z.infer<typeof uploadInputSchema>,
  ctx: FileCapabilityContext,
): Promise<{
  buffer: Buffer
  contentType: string
}> {
  const ref = fileRefFromUploadInput(input)
  const resolved = await resolveFile(ref, ctx, {
    allowRemoteUrls: ref.kind === FILE_REF_KINDS.URL,
  })
  return {
    buffer: Buffer.from(resolved.bytes),
    contentType: input.contentType ?? resolved.mediaType ?? "application/octet-stream",
  }
}

async function handleNodeUpload(
  parsed: z.infer<typeof uploadInputSchema>,
  ctx: FileCapabilityContext,
): Promise<z.infer<typeof uploadOutputSchema>> {
  const { randomUUID } = await import("node:crypto")
  const credentials = createAzureBlobCredentials(readAzureConfig(ctx))
  const container = resolveContainer(credentials, parsed.container)
  const blobName = parsed.blobName ?? randomUUID()
  const { buffer, contentType } = await resolveUploadBytes(parsed, ctx)

  const blockBlob = credentials.client
    .getContainerClient(container)
    .getBlockBlobClient(blobName)

  const result = await blockBlob.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: contentType },
  })

  const blobUrl = blockBlob.url
  let sasUrl: string | undefined
  if (parsed.createReadSas) {
    const expiresInSeconds =
      parsed.sasExpiresInSeconds ?? credentials.defaultSasExpiresInSeconds
    sasUrl = createBlobSasUrl({
      credentials,
      container,
      blobName,
      permissions: ["r"],
      expiresInSeconds,
    }).sasUrl
  }

  return uploadOutputSchema.parse({
    container,
    blobName,
    blobUrl,
    contentType,
    etag: result.etag,
    sasUrl,
  })
}

/**
 * Upload a blob to Azure Blob Storage.
 * Browser locators (`ecp://browser/<id>`) run mixed: hop create-sas-url, PUT from the tab.
 * Container CORS must allow the demo origin for that PUT.
 * Node sources use core {@link resolveFile} for `filePath` / `sourceUrl` / `contentBase64`.
 * @category Azure
 */
export async function handleUpload(
  input: unknown,
  ctx: unknown,
): Promise<z.infer<typeof uploadOutputSchema>> {
  const parsed = uploadInputSchema.parse(input)
  const locator = locatorFromInput(parsed)
  if (locator && isBrowserFileLocator(locator)) {
    return handleMixedUpload(input, ctx)
  }
  const nodeInput =
    parsed.source && !parsed.filePath
      ? { ...parsed, filePath: parsed.source, source: undefined }
      : parsed
  return handleNodeUpload(nodeInput, ctx as FileCapabilityContext)
}
