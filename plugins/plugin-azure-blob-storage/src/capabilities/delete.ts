import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"
import { deleteBlob } from "../azure-client.js"
import { resolveConfig, resolveContainer } from "../config.js"
import type { DeleteInput, DeleteOutput } from "../schemas.js"

/**
 * Delete handler: remove one blob, optionally tolerating a missing object.
 * @category Plugins
 */
export default async function handler(input: DeleteInput, ctx: HandlerContext): Promise<DeleteOutput> {
  const config = resolveConfig(ctx.config)
  const container = resolveContainer(config, input.container)
  const ifMissing = input.ifMissing ?? "error"

  const { deleted } = await deleteBlob(config, {
    container,
    blobName: input.blobName,
    ifMissing,
    signal: ctx.signal,
  })

  return { blobName: input.blobName, container, deleted }
}