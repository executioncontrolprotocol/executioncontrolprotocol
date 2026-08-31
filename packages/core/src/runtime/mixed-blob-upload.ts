import type { CapabilityContext } from "./context.js"
import { isBrowserFileLocator } from "./blobs.js"

/** Input for {@link handleMixedBrowserBlobUpload}. @category Runtime */
export interface MixedBlobUploadInput {
  /** Browser locator (`ecp://browser/<id>`). */
  source?: string
  /** CLI-compatible path; also accepts a browser locator. */
  filePath?: string
  /** Optional container name forwarded to create-sas-url. */
  container?: string
  /** Blob name; generated when omitted. */
  blobName?: string
  /** Content type override. */
  contentType?: string
  /** When true, mint a read SAS after the PUT. */
  createReadSas?: boolean
  /** SAS lifetime in seconds. */
  sasExpiresInSeconds?: number
}

/** Output for {@link handleMixedBrowserBlobUpload}. @category Runtime */
export interface MixedBlobUploadOutput {
  /** Container name. */
  container: string
  /** Blob name. */
  blobName: string
  /** Blob URL without SAS. */
  blobUrl: string
  /** Content type written. */
  contentType: string
  /** Read or write SAS URL. */
  sasUrl?: string
}

function locatorFromInput(input: MixedBlobUploadInput): string | undefined {
  if (typeof input.source === "string" && input.source.length > 0) return input.source
  if (typeof input.filePath === "string" && input.filePath.length > 0) return input.filePath
  return undefined
}

/**
 * Mixed-mode browser upload: read a stashed File, hop create-sas-url, PUT from the tab.
 * @category Runtime
 */
export async function handleMixedBrowserBlobUpload(
  input: MixedBlobUploadInput,
  ctx: CapabilityContext,
  createSasCapabilityId: string
): Promise<MixedBlobUploadOutput> {
  const locator = locatorFromInput(input)
  if (!locator || !isBrowserFileLocator(locator)) {
    throw new Error("Browser upload requires an ecp://browser/<id> locator")
  }
  const blob = ctx.blobs?.get(locator)
  if (!blob) {
    throw new Error(`No file stashed for locator ${locator}`)
  }
  const blobName = input.blobName ?? globalThis.crypto.randomUUID()
  const contentType = input.contentType || blob.type || "application/octet-stream"
  const writeSas = (await ctx.capabilities.call(createSasCapabilityId, {
    container: input.container,
    blobName,
    permissions: ["c", "w"],
    expiresInSeconds: input.sasExpiresInSeconds,
  })) as { sasUrl?: string; container?: string }
  if (typeof writeSas.sasUrl !== "string" || !writeSas.sasUrl) {
    throw new Error("create-sas-url did not return sasUrl")
  }
  const bytes = await blob.arrayBuffer()
  const put = await fetch(writeSas.sasUrl, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": contentType,
    },
    body: bytes,
  })
  if (!put.ok) {
    throw new Error(`Azure PUT failed (${put.status})`)
  }
  const blobUrl = writeSas.sasUrl.split("?")[0] ?? writeSas.sasUrl
  let sasUrl: string | undefined
  if (input.createReadSas) {
    const readSas = (await ctx.capabilities.call(createSasCapabilityId, {
      container: input.container,
      blobName,
      permissions: ["r"],
      expiresInSeconds: input.sasExpiresInSeconds,
    })) as { sasUrl?: string }
    if (typeof readSas.sasUrl === "string") sasUrl = readSas.sasUrl
  }
  return {
    container: input.container ?? writeSas.container ?? "",
    blobName,
    blobUrl,
    contentType,
    sasUrl,
  }
}
