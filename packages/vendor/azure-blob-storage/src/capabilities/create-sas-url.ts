import { z } from "zod"
import {
  createAzureBlobCredentials,
  readAzureConfig,
  resolveContainer,
} from "../client.js"
import { createBlobSasUrl } from "../sas.js"
import { createSasUrlInputSchema, createSasUrlOutputSchema } from "./create-sas-url-schema.js"

export { createSasUrlInputSchema, createSasUrlOutputSchema }

/**
 * Mint a blob SAS URL.
 * @category Azure
 */
export async function handleCreateSasUrl(
  input: unknown,
  ctx: unknown,
): Promise<z.infer<typeof createSasUrlOutputSchema>> {
  const parsed = createSasUrlInputSchema.parse(input)
  const credentials = createAzureBlobCredentials(readAzureConfig(ctx))
  const container = resolveContainer(credentials, parsed.container)
  const expiresInSeconds =
    parsed.expiresInSeconds ?? credentials.defaultSasExpiresInSeconds

  return createSasUrlOutputSchema.parse(
    createBlobSasUrl({
      credentials,
      container,
      blobName: parsed.blobName,
      permissions: parsed.permissions,
      expiresInSeconds,
    }),
  )
}
