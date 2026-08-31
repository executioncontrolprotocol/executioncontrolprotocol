import {
  FILE_REF_KINDS,
  type FileRef,
} from "@executioncontrolprotocol/types"
import { isBrowserFileLocator } from "../runtime/blobs.js"
import type { CapabilityContext } from "../runtime/context.js"

/** URI prefix for durable storage-backed artifacts. @category File */
export const STORAGE_ARTIFACT_URI_PREFIX = "ecp://storage/"

/** Resolved file bytes from {@link resolveFile}. @category File */
export interface ResolvedFile {
  /** Raw bytes. */
  bytes: Uint8Array
  /** MIME type when known. */
  mediaType?: string
  /** Byte length. */
  sizeBytes: number
  /** Optional display name. */
  name?: string
}

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

async function readFileFromPath(path: string): Promise<Uint8Array> {
  try {
    const mod = await import("../loaders/read-media-file.js")
    return mod.readMediaFileFromPath(path)
  } catch {
    throw new Error(
      "File media refs require Node.js (node:fs/promises is not available in this runtime)"
    )
  }
}

async function readBrowserLocator(
  locator: string,
  ctx: FileCapabilityContext,
  mediaType?: string
): Promise<ResolvedFile> {
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

function readStoredArtifact(
  uri: string,
  ctx: FileCapabilityContext,
  mediaType?: string
): ResolvedFile {
  const fromCtx = ctx.artifacts?.get(uri)
  if (!fromCtx) {
    throw new Error(`Artifact not found: ${uri}`)
  }
  return {
    bytes: fromCtx.bytes instanceof Uint8Array ? fromCtx.bytes : new Uint8Array(fromCtx.bytes),
    mediaType: mediaType ?? fromCtx.mediaType,
    sizeBytes: fromCtx.size,
    name: fromCtx.name,
  }
}

/**
 * Resolve a portable {@link FileRef} to bytes using blobs, artifacts, fetch, or Node fs.
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
      const bytes =
        typeof Buffer !== "undefined"
          ? new Uint8Array(Buffer.from(ref.data, "base64"))
          : Uint8Array.from(atob(ref.data), (c) => c.charCodeAt(0))
      return { bytes, mediaType: ref.mediaType, sizeBytes: bytes.byteLength }
    }
    case FILE_REF_KINDS.FILE: {
      if (isBrowserFileLocator(ref.path)) {
        return readBrowserLocator(ref.path, ctx, ref.mediaType)
      }
      const bytes = await readFileFromPath(ref.path)
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
    case FILE_REF_KINDS.ARTIFACT: {
      if (isBrowserFileLocator(ref.uri)) {
        return readBrowserLocator(ref.uri, ctx, ref.mediaType)
      }
      if (ref.uri.startsWith(STORAGE_ARTIFACT_URI_PREFIX)) {
        const key = ref.uri.slice(STORAGE_ARTIFACT_URI_PREFIX.length)
        const result = (await ctx.capabilities.call("@executioncontrolprotocol/storage.read", {
          key,
        })) as { value?: unknown }
        if (result.value instanceof Uint8Array) {
          return {
            bytes: result.value,
            mediaType: ref.mediaType,
            sizeBytes: result.value.byteLength,
            name: ref.name,
          }
        }
        if (typeof result.value === "string") {
          const bytes =
            typeof Buffer !== "undefined"
              ? new Uint8Array(Buffer.from(result.value, "base64"))
              : Uint8Array.from(atob(result.value), (c) => c.charCodeAt(0))
          return {
            bytes,
            mediaType: ref.mediaType,
            sizeBytes: bytes.byteLength,
            name: ref.name,
          }
        }
        throw new Error(`Artifact not found: ${ref.uri}`)
      }
      return readStoredArtifact(ref.uri, ctx, ref.mediaType)
    }
    default:
      throw new Error("Unsupported file reference kind")
  }
}
