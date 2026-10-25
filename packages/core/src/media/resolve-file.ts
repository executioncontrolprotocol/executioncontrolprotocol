import {
  FILE_REF_KINDS,
  type FileRef,
} from "../types/index.js"
import type { CapabilityContext } from "../runtime/context.js"
import {
  DEFAULT_MEDIA_PREFIX,
  MediaStore,
  type MediaStore as MediaStoreService,
  type MediaStoreContext,
} from "../services/media-store.js"
import { base64ToBytes } from "./base64.js"
import type { ResolvedFile } from "./resolved-file.js"

export type { ResolvedFile } from "./resolved-file.js"

/** Options for {@link resolveFile}. @category File */
export interface ResolveFileOptions {
  /** When false (default), `kind: "url"` refs are rejected. */
  allowRemoteUrls?: boolean
}

/** Context required to resolve {@link FileRef} values. @category File */
export type FileCapabilityContext = CapabilityContext & {
  /** Bound extension config (limits / storage prefixes). */
  extensionConfig?: Record<string, unknown>
}

/**
 * Build a {@link MediaStoreContext} from a capability context.
 * @category File
 */
export function mediaStoreContextFrom(ctx: FileCapabilityContext): MediaStoreContext {
  return {
    blobs: ctx.blobs,
    artifacts: ctx.artifacts,
    remoteInvoke: ctx.remoteInvoke,
    extensionConfig: ctx.extensionConfig,
  }
}

/**
 * Require a bound {@link MediaStore} on {@link FileCapabilityContext.services}.
 * @category File
 */
export function requireMediaStore(ctx: FileCapabilityContext): MediaStoreService {
  const store = ctx.services?.get(MediaStore)
  if (!store) {
    throw new Error(
      "No MediaStore is bound. Hosts call environment().use(createDiskMediaStore()) (or the browser equivalent) before run or invoke."
    )
  }
  return store
}

/**
 * Resolve a portable {@link FileRef} to bytes using buffers, fetch, or the bound {@link MediaStore}.
 * Extensions should call this instead of reimplementing I/O.
 * @category File
 */
export async function resolveFile(
  ref: FileRef,
  ctx: FileCapabilityContext,
  options: ResolveFileOptions = {}
): Promise<ResolvedFile> {
  const cfg = ctx.extensionConfig ?? {}
  const limits = (cfg.limits as { allowRemoteUrls?: boolean } | undefined) ?? {}
  const allowRemoteUrls = options.allowRemoteUrls ?? limits.allowRemoteUrls ?? false

  switch (ref.kind) {
    case FILE_REF_KINDS.BUFFER: {
      const bytes = base64ToBytes(ref.data)
      return { bytes, mediaType: ref.mediaType, sizeBytes: bytes.byteLength }
    }
    case FILE_REF_KINDS.URL: {
      if (!allowRemoteUrls) {
        throw new Error("Remote URL media refs are disabled (allowRemoteUrls)")
      }
      const res = await fetch(ref.url, { headers: ref.headers })
      if (!res.ok) throw new Error(`Failed to fetch media URL: ${res.status}`)
      const arrayBuf = await res.arrayBuffer()
      const bytes = new Uint8Array(arrayBuf)
      const mediaType = ref.mediaType ?? res.headers.get("content-type") ?? undefined
      return { bytes, mediaType, sizeBytes: bytes.byteLength }
    }
    case FILE_REF_KINDS.FILE:
    case FILE_REF_KINDS.ARTIFACT:
      return requireMediaStore(ctx).read(ref, mediaStoreContextFrom(ctx))
    default:
      throw new Error("Unsupported file reference kind")
  }
}

/** Prefix used when a write omits `prefix` and extension config has none. @category File */
export { DEFAULT_MEDIA_PREFIX }
