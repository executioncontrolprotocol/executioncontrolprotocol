import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"
import { downloadBytes } from "../azure-client.js"
import { resolveConfig, resolveContainer } from "../config.js"
import type { DownloadInput, DownloadOutput } from "../schemas.js"

const DEFAULT_CONTENT_TYPE = "application/octet-stream"
const DEFAULT_ARTIFACT_NAME = "blob"

/**
 * Download handler: fetch the blob and store it as a run artifact.
 * @category Plugins
 */
export default async function handler(input: DownloadInput, ctx: HandlerContext): Promise<DownloadOutput> {
  const config = resolveConfig(ctx.config)
  const container = resolveContainer(config, input.container)

  const blob = await downloadBytes(config, { container, blobName: input.blobName, signal: ctx.signal })
  const name = input.blobName.split("/").filter(Boolean).pop() ?? DEFAULT_ARTIFACT_NAME
  const file = await ctx.files.fromBytes(blob.bytes, {
    mediaType: blob.contentType ?? DEFAULT_CONTENT_TYPE,
    name,
  })
  return { file }
}
