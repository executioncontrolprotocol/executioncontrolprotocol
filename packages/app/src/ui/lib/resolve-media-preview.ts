import { base64ToBytes } from "@executioncontrolprotocol/core"
import type { CollectedMediaRef } from "./run-media-refs.js"
import { previewKindForMediaType, type MediaPreviewKind } from "./run-media-refs.js"

/** Resolved preview for a collected media ref. @category App */
export interface ResolvedMediaPreview {
  /** Source path in the run result. */
  path: string
  /** MIME type used for the blob / open URL. */
  mediaType: string
  /** Native preview kind. */
  previewKind: MediaPreviewKind
  /** Object URL or remote URL for `<img>` / Open. */
  url: string
  /** Whether `url` is a `blob:` that must be revoked. */
  revokeUrl: boolean
  /** Optional filename. */
  name?: string
  /** Error message when resolution failed. */
  error?: string
}

/** Host media reader used by {@link resolveMediaPreview}. @category App */
export type ReadMediaFn = (
  uri: string
) => Promise<{ bytes: string; mediaType?: string; name?: string }>

function isHostLocator(locator: string): boolean {
  return (
    locator.startsWith("ecp://file/") ||
    locator.startsWith("ecp://artifacts/") ||
    locator.startsWith("ecp://storage/")
  )
}

/**
 * Resolve a collected media ref into a browser-openable URL.
 * @category App
 */
export async function resolveMediaPreview(
  ref: CollectedMediaRef,
  options: {
    readMedia?: ReadMediaFn
  }
): Promise<ResolvedMediaPreview> {
  const base = {
    path: ref.path,
    name: ref.name,
  }

  try {
    if (ref.kind === "buffer" && ref.dataBase64) {
      const bytes = base64ToBytes(ref.dataBase64)
      const mediaType = ref.mediaType || "application/octet-stream"
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      const url = URL.createObjectURL(new Blob([copy], { type: mediaType }))
      return {
        ...base,
        mediaType,
        previewKind: previewKindForMediaType(mediaType),
        url,
        revokeUrl: true,
      }
    }

    if (ref.kind === "url" && ref.locator) {
      const mediaType = ref.mediaType || "application/octet-stream"
      return {
        ...base,
        mediaType,
        previewKind: previewKindForMediaType(mediaType),
        url: ref.locator,
        revokeUrl: false,
      }
    }

    const locator = ref.locator
    if (!locator) {
      return {
        ...base,
        mediaType: ref.mediaType || "application/octet-stream",
        previewKind: "download",
        url: "",
        revokeUrl: false,
        error: "Missing locator",
      }
    }

    if (isHostLocator(locator)) {
      if (!options.readMedia) {
        return {
          ...base,
          mediaType: ref.mediaType || "application/octet-stream",
          previewKind: "download",
          url: "",
          revokeUrl: false,
          error: "Host media preview is unavailable",
        }
      }
      const fetched = await options.readMedia(locator)
      const mediaType = fetched.mediaType || ref.mediaType || "application/octet-stream"
      const bytes = base64ToBytes(fetched.bytes)
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      const url = URL.createObjectURL(new Blob([copy], { type: mediaType }))
      return {
        ...base,
        mediaType,
        previewKind: previewKindForMediaType(mediaType),
        url,
        revokeUrl: true,
        name: ref.name || fetched.name,
      }
    }

    return {
      ...base,
      mediaType: ref.mediaType || "application/octet-stream",
      previewKind: "download",
      url: "",
      revokeUrl: false,
      error: "This media locator cannot be previewed in the browser",
    }
  } catch (err) {
    return {
      ...base,
      mediaType: ref.mediaType || "application/octet-stream",
      previewKind: "download",
      url: "",
      revokeUrl: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
