import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import {
  DEFAULT_MEDIA_PREFIX,
  FILE_ARTIFACT_URI_PREFIX,
  MEDIA_STORE_ID,
  defaultArtifactFilename,
  isBrowserFileLocator,
  readBrowserLocator,
  type MediaStore,
  type MediaStoreContext,
  type MediaWriteOptions,
  type ResolvedFile,
} from "@executioncontrolprotocol/core"
import { FILE_REF_KINDS, type FileRef } from "@executioncontrolprotocol/core/types"
import { readMediaFileFromPath } from "../loaders/read-media-file.js"
import { artifactsRoot, assertRelativeArtifactKey, resolveUnderRoot } from "./paths.js"

/** Options for {@link createDiskMediaStore}. @category Media */
export interface DiskMediaStoreOptions {
  /** Override the artifacts root (tests). Default {@link artifactsRoot}. */
  root?: string
}

function artifactUri(key: string): string {
  return `${FILE_ARTIFACT_URI_PREFIX}${key}`
}

function keyFromArtifactUri(uri: string): string {
  if (!uri.startsWith(FILE_ARTIFACT_URI_PREFIX)) {
    throw new Error(`Unsupported artifact URI: ${uri}`)
  }
  return assertRelativeArtifactKey(uri.slice(FILE_ARTIFACT_URI_PREFIX.length))
}

/**
 * Node {@link MediaStore}: disk under `.ecp/artifacts` (or `ECP_ARTIFACTS_DIR`).
 * @category Media
 */
export function createDiskMediaStore(options: DiskMediaStoreOptions = {}): MediaStore {
  const root = () => options.root ?? artifactsRoot()

  return {
    service: MEDIA_STORE_ID,
    async read(ref: FileRef, ctx: MediaStoreContext): Promise<ResolvedFile> {
      if (ref.kind === FILE_REF_KINDS.FILE) {
        if (isBrowserFileLocator(ref.path)) {
          return readBrowserLocator(ref.path, ctx, ref.mediaType)
        }
        const bytes = await readMediaFileFromPath(ref.path)
        return { bytes, mediaType: ref.mediaType, sizeBytes: bytes.byteLength }
      }
      if (ref.kind === FILE_REF_KINDS.ARTIFACT) {
        if (isBrowserFileLocator(ref.uri)) {
          return readBrowserLocator(ref.uri, ctx, ref.mediaType)
        }
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
        const key = keyFromArtifactUri(ref.uri)
        const dest = resolveUnderRoot(root(), key)
        const bytes = await readMediaFileFromPath(dest)
        return {
          bytes,
          mediaType: ref.mediaType,
          sizeBytes: bytes.byteLength,
          name: ref.name,
        }
      }
      throw new Error(`Disk MediaStore cannot read kind ${String((ref as FileRef).kind)}`)
    },
    async write(
      bytes: Uint8Array,
      writeOptions: MediaWriteOptions,
      _ctx: MediaStoreContext
    ): Promise<FileRef> {
      const prefix = writeOptions.prefix ?? DEFAULT_MEDIA_PREFIX
      const name = writeOptions.name ?? defaultArtifactFilename(writeOptions.mediaType)
      const key = assertRelativeArtifactKey(`${prefix}/${name}`)
      const dest = resolveUnderRoot(root(), key)
      await mkdir(dirname(dest), { recursive: true })
      const copy = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      await writeFile(dest, copy)
      return {
        kind: FILE_REF_KINDS.ARTIFACT,
        uri: artifactUri(key),
        mediaType: writeOptions.mediaType,
        name,
        sizeBytes: copy.byteLength,
      }
    },
  }
}
