import { isBrowserFileLocator } from "../runtime/blobs.js"
import type { MediaStoreContext } from "../services/media-store.js"
import type { ResolvedFile } from "./resolved-file.js"

/**
 * Read an `ecp://browser/<id>` locator from {@link MediaStoreContext.blobs}.
 * @category File
 */
export async function readBrowserLocator(
  locator: string,
  ctx: MediaStoreContext,
  mediaType?: string
): Promise<ResolvedFile> {
  if (!isBrowserFileLocator(locator)) {
    throw new Error(`Not a browser file locator: ${locator}`)
  }
  const blob = ctx.blobs?.get(locator)
  if (!blob) {
    throw new Error(`No file stashed for locator ${locator}`)
  }
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return {
    bytes,
    mediaType: mediaType || blob.type || undefined,
    sizeBytes: bytes.byteLength,
    name: blob.name || undefined,
  }
}
