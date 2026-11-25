import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"
import { createSas } from "../azure-client.js"
import { resolveConfig, resolveContainer } from "../config.js"
import {
  DEFAULT_SAS_EXPIRES_IN_SECONDS,
  DEFAULT_SAS_PERMISSIONS,
  type SasInput,
  type SasOutput,
} from "../schemas.js"

/**
 * SAS handler: mint a time-limited signed URL for one blob.
 * @category Plugins
 */
export default async function handler(input: SasInput, ctx: HandlerContext): Promise<SasOutput> {
  const config = resolveConfig(ctx.config)
  const container = resolveContainer(config, input.container)
  const { sasUrl, expiresOn } = await createSas(config, {
    container,
    blobName: input.blobName,
    permissions: input.permissions ?? DEFAULT_SAS_PERMISSIONS,
    expiresInSeconds: input.expiresInSeconds ?? DEFAULT_SAS_EXPIRES_IN_SECONDS,
  })
  return {
    file: { kind: "url" as const, url: sasUrl },
    expiresOn,
  }
}
