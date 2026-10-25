import type { FileRef } from "../types/index.js"
import type { CapabilityArtifactStore } from "../runtime/artifacts.js"
import type { CapabilityBlobStore } from "../runtime/blobs.js"
import type { RemoteInvokeBinding } from "../runtime/remote-invoke.js"
import type { ResolvedFile } from "../media/resolved-file.js"
import type { ServiceProvider, ServiceToken } from "./provider.js"

/** Interface id for {@link MediaStore}. @category Media */
export const MEDIA_STORE_ID = "@executioncontrolprotocol/MediaStore" as const

/** URI prefix for disk-backed artifacts (`ecp://file/<relative>`). @category Media */
export const FILE_ARTIFACT_URI_PREFIX = "ecp://file/"

/** Default URI path prefix when a write omits `prefix`. @category Media */
export const DEFAULT_MEDIA_PREFIX = "artifacts/media"

/** HTTP path for paired-host media upload and download. @category Media */
export const MEDIA_HTTP_PATH = "/v1/media"

/**
 * Context a {@link MediaStore} may use (blobs, pairing, extension config).
 * @category Media
 */
export interface MediaStoreContext {
  /** Run-scoped browser files keyed by `ecp://browser/<id>` locators. */
  blobs?: CapabilityBlobStore
  /** Optional in-process artifact map for same-run preview. */
  artifacts?: CapabilityArtifactStore
  /** Paired Node host for browser upload/read. */
  remoteInvoke?: RemoteInvokeBinding
  /** Bound extension config (output prefix). */
  extensionConfig?: Record<string, unknown>
}

/**
 * Options for {@link MediaStore.write}.
 * @category Media
 */
export interface MediaWriteOptions {
  /** MIME type. */
  mediaType: string
  /** Optional filename. */
  name?: string
  /** URI path prefix under the store (default {@link DEFAULT_MEDIA_PREFIX}). */
  prefix?: string
}

/**
 * Host file read/write bound with {@link Environment.use}.
 * @category Media
 */
export interface MediaStore extends ServiceProvider<typeof MEDIA_STORE_ID> {
  /** Resolve a `file` or `artifact` {@link FileRef} to bytes. */
  read(ref: FileRef, ctx: MediaStoreContext): Promise<ResolvedFile>
  /** Persist bytes and return an artifact {@link FileRef}. */
  write(
    bytes: Uint8Array,
    options: MediaWriteOptions,
    ctx: MediaStoreContext
  ): Promise<FileRef>
}

/**
 * Lookup token for {@link Environment.get} / {@link ServiceMap.get}.
 * @category Media
 */
export const MediaStore: ServiceToken<MediaStore> = {
  id: MEDIA_STORE_ID,
}

/** JSON body for `POST {@link MEDIA_HTTP_PATH}`. @category Media */
export interface MediaHttpWriteRequest {
  /** File bytes as base64. */
  bytes: string
  /** MIME type. */
  mediaType: string
  /** Optional filename. */
  name?: string
  /** Optional URI path prefix. */
  prefix?: string
}

/** JSON body for `GET {@link MEDIA_HTTP_PATH}?uri=`. @category Media */
export interface MediaHttpReadResponse {
  /** File bytes as base64. */
  bytes: string
  /** MIME type when known. */
  mediaType?: string
  /** Optional display name. */
  name?: string
  /** Byte length. */
  sizeBytes: number
}
