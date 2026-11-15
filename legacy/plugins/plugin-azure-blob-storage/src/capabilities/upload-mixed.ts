import { z } from "zod"
import {
  handleMixedBrowserBlobUpload,
  isBrowserFileLocator,
  type CapabilityContext,
} from "@executioncontrolprotocol/core"
import { uploadInputSchema, uploadOutputSchema } from "./upload-schema.js"

const CREATE_SAS_CAPABILITY_ID = "@executioncontrolprotocol/azure-blob-storage.create-sas-url"

function locatorFromInput(input: z.infer<typeof uploadInputSchema>): string | undefined {
  if (typeof input.source === "string" && input.source.length > 0) return input.source
  if (typeof input.filePath === "string" && input.filePath.length > 0) return input.filePath
  return undefined
}

/**
 * Mixed browser upload: hop create-sas-url, PUT from the tab. No Azure SDK.
 * @category Azure
 */
export async function handleMixedUpload(
  input: unknown,
  ctx: unknown,
): Promise<z.infer<typeof uploadOutputSchema>> {
  const parsed = uploadInputSchema.parse(input)
  const locator = locatorFromInput(parsed)
  if (!locator || !isBrowserFileLocator(locator)) {
    throw new Error(
      "Browser Azure upload requires an ecp://browser/<id> locator. Node sources hop with create-sas-url on the host.",
    )
  }
  return uploadOutputSchema.parse(
    await handleMixedBrowserBlobUpload(
      {
        source: locator,
        container: parsed.container,
        blobName: parsed.blobName,
        contentType: parsed.contentType,
        createReadSas: parsed.createReadSas,
        sasExpiresInSeconds: parsed.sasExpiresInSeconds,
      },
      ctx as CapabilityContext,
      CREATE_SAS_CAPABILITY_ID,
    ),
  )
}
