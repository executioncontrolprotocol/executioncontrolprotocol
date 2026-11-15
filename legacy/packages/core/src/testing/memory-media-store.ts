import { FILE_REF_KINDS, type FileRef } from "../types/index.js"
import { isBrowserFileLocator } from "../runtime/blobs.js"
import {
  DEFAULT_MEDIA_PREFIX,
  FILE_ARTIFACT_URI_PREFIX,
  MEDIA_STORE_ID,
  type MediaStore,
  type MediaStoreContext,
  type MediaWriteOptions,
} from "../services/media-store.js"
import { readBrowserLocator } from "../media/browser-locator.js"
import { defaultArtifactFilename } from "../media/artifact-filename.js"
import type { ResolvedFile } from "../media/resolved-file.js"

/** In-memory bytes keyed by path or artifact URI. @category Testing */
export interface MemoryMediaRecord {
  /** Raw bytes. */
  bytes: Uint8Array
  /** MIME type when known. */
  mediaType?: string
  /** Optional display name. */
  name?: string
}

/**
 * Test {@link MediaStore} that keeps bytes in a map. Not a production host store.
 * @category Testing
 */
export interface MemoryMediaStore extends MediaStore {
  /** Bytes keyed by file path or artifact URI. */
  readonly files: Map<string, MemoryMediaRecord>
}

function recordToResolved(
  record: MemoryMediaRecord,
  mediaType?: string,
  name?: string
): ResolvedFile {
  return {
    bytes: record.bytes,
    mediaType: mediaType ?? record.mediaType,
    sizeBytes: record.bytes.byteLength,
    name: name ?? record.name,
  }
}

/**
 * Create a fake {@link MediaStore} for unit tests (no disk I/O).
 * @category Testing
 */
export function createMemoryMediaStore(): MemoryMediaStore {
  const files = new Map<string, MemoryMediaRecord>()
  const store: MemoryMediaStore = {
    service: MEDIA_STORE_ID,
    files,
    async read(ref: FileRef, ctx: MediaStoreContext): Promise<ResolvedFile> {
      if (ref.kind === FILE_REF_KINDS.FILE) {
        if (isBrowserFileLocator(ref.path)) {
          return readBrowserLocator(ref.path, ctx, ref.mediaType)
        }
        const fromFiles = files.get(ref.path)
        if (fromFiles) return recordToResolved(fromFiles, ref.mediaType)
        throw new Error(`File not found: ${ref.path}`)
      }
      if (ref.kind === FILE_REF_KINDS.ARTIFACT) {
        if (isBrowserFileLocator(ref.uri)) {
          return readBrowserLocator(ref.uri, ctx, ref.mediaType)
        }
        const fromFiles = files.get(ref.uri)
        if (fromFiles) return recordToResolved(fromFiles, ref.mediaType, ref.name)
        const fromCtx = ctx.artifacts?.get(ref.uri)
        if (fromCtx) {
          const bytes =
            fromCtx.bytes instanceof Uint8Array ? fromCtx.bytes : new Uint8Array(fromCtx.bytes)
          return {
            bytes,
            mediaType: ref.mediaType ?? fromCtx.mediaType,
            sizeBytes: fromCtx.size,
            name: ref.name ?? fromCtx.name,
          }
        }
        throw new Error(`Artifact not found: ${ref.uri}`)
      }
      throw new Error(`Memory MediaStore cannot read kind ${String((ref as FileRef).kind)}`)
    },
    async write(
      bytes: Uint8Array,
      options: MediaWriteOptions,
      _ctx: MediaStoreContext
    ): Promise<FileRef> {
      const prefix = options.prefix ?? DEFAULT_MEDIA_PREFIX
      const name = options.name ?? defaultArtifactFilename(options.mediaType)
      const uri = `${FILE_ARTIFACT_URI_PREFIX}${prefix}/${name}`
      const copy = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      files.set(uri, { bytes: copy, mediaType: options.mediaType, name })
      return {
        kind: FILE_REF_KINDS.ARTIFACT,
        uri,
        mediaType: options.mediaType,
        name,
        sizeBytes: copy.byteLength,
      }
    },
  }
  return store
}
