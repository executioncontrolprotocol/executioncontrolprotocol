import { randomUUID } from "node:crypto"
import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"
import { createSas, uploadBytes } from "../azure-client.js"
import { resolveConfig, resolveContainer } from "../config.js"
import {
  DEFAULT_SAS_EXPIRES_IN_SECONDS,
  DEFAULT_SAS_PERMISSIONS,
  type UploadInput,
  type UploadOutput,
} from "../schemas.js"

const DEFAULT_CONTENT_TYPE = "application/octet-stream"

/**
 * Upload handler: read the file ref, upload it as a block blob, optionally mint a read SAS.
 * @category Plugins
 */
export default async function handler(input: UploadInput, ctx: HandlerContext): Promise<UploadOutput> {
  const config = resolveConfig(ctx.config)
  const container = resolveContainer(config, input.container)
  ctx.signal.throwIfAborted()

  const read = await ctx.files.read(input.file)
  const blobName = input.blobName ?? randomUUID()
  const contentType = input.contentType ?? read.mediaType ?? input.file.mediaType ?? DEFAULT_CONTENT_TYPE

  const { blobUrl } = await uploadBytes(config, {
    container,
    blobName,
    bytes: read.bytes,
    contentType,
    signal: ctx.signal,
  })
  ctx.logger.info("Uploaded blob", { container, blobName, sizeBytes: read.bytes.byteLength })

  if (!input.createReadSas) return { blobName, container, blobUrl }
  const { sasUrl } = await createSas(config, {
    container,
    blobName,
    permissions: DEFAULT_SAS_PERMISSIONS,
    expiresInSeconds: DEFAULT_SAS_EXPIRES_IN_SECONDS,
  })
  return { blobName, container, blobUrl, sasUrl }
}
