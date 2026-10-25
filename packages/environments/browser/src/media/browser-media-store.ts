import {
  FILE_ARTIFACT_URI_PREFIX,
  MEDIA_HTTP_PATH,
  MEDIA_STORE_ID,
  base64ToBytes,
  bytesToBase64,
  isBrowserFileLocator,
  readBrowserLocator,
  stashCapabilityBlob,
  type MediaHttpReadResponse,
  type MediaStore,
  type MediaStoreContext,
  type MediaWriteOptions,
  type ResolvedFile,
} from "@executioncontrolprotocol/core"
import { FILE_REF_KINDS, type FileRef } from "@executioncontrolprotocol/core/types"

const PAIR_MESSAGE =
  "File media refs require a paired Node host. Start `ecp app` and bind remoteInvoke."

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "")
}

function mediaUrl(base: string, query?: Record<string, string>): string {
  const url = new URL(`${trimSlash(base)}${MEDIA_HTTP_PATH}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  }
  return url.href
}

async function postToHost(
  ctx: MediaStoreContext,
  bytes: Uint8Array,
  options: MediaWriteOptions
): Promise<FileRef> {
  const binding = ctx.remoteInvoke
  if (!binding?.url || !binding.token) {
    throw new Error(PAIR_MESSAGE)
  }
  const res = await fetch(mediaUrl(binding.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${binding.token}`,
    },
    body: JSON.stringify({
      bytes: bytesToBase64(bytes),
      mediaType: options.mediaType,
      name: options.name,
      prefix: options.prefix,
    }),
  })
  if (!res.ok) {
    throw new Error(`Paired host media write failed (${res.status})`)
  }
  const body = (await res.json()) as FileRef
  if (!body || typeof body !== "object" || body.kind !== FILE_REF_KINDS.ARTIFACT) {
    throw new Error("Paired host media write did not return an artifact FileRef")
  }
  return body
}

async function getFromHost(ctx: MediaStoreContext, uri: string): Promise<ResolvedFile> {
  const binding = ctx.remoteInvoke
  if (!binding?.url || !binding.token) {
    throw new Error(PAIR_MESSAGE)
  }
  const res = await fetch(mediaUrl(binding.url, { uri }), {
    headers: { Authorization: `Bearer ${binding.token}` },
  })
  if (!res.ok) {
    throw new Error(`Paired host media read failed (${res.status})`)
  }
  const body = (await res.json()) as MediaHttpReadResponse
  if (typeof body?.bytes !== "string") {
    throw new Error("Paired host media read did not return bytes")
  }
  const bytes = base64ToBytes(body.bytes)
  return {
    bytes,
    mediaType: body.mediaType,
    sizeBytes: typeof body.sizeBytes === "number" ? body.sizeBytes : bytes.byteLength,
    name: body.name,
  }
}

/**
 * Browser {@link MediaStore}: `ecp://browser` refs locally; disk URIs via a paired host.
 * @category Media
 */
export function createBrowserMediaStore(): MediaStore {
  return {
    service: MEDIA_STORE_ID,
    async read(ref: FileRef, ctx: MediaStoreContext): Promise<ResolvedFile> {
      if (ref.kind === FILE_REF_KINDS.FILE) {
        if (isBrowserFileLocator(ref.path)) {
          return readBrowserLocator(ref.path, ctx, ref.mediaType)
        }
        throw new Error(PAIR_MESSAGE)
      }
      if (ref.kind === FILE_REF_KINDS.ARTIFACT) {
        if (isBrowserFileLocator(ref.uri)) {
          return readBrowserLocator(ref.uri, ctx, ref.mediaType)
        }
        if (ref.uri.startsWith(FILE_ARTIFACT_URI_PREFIX)) {
          return getFromHost(ctx, ref.uri)
        }
        throw new Error(PAIR_MESSAGE)
      }
      throw new Error(`Browser MediaStore cannot read kind ${String((ref as FileRef).kind)}`)
    },
    async write(
      bytes: Uint8Array,
      options: MediaWriteOptions,
      ctx: MediaStoreContext
    ): Promise<FileRef> {
      if (ctx.remoteInvoke?.url && ctx.remoteInvoke.token) {
        return postToHost(ctx, bytes, options)
      }
      if (!ctx.blobs) {
        throw new Error("Browser MediaStore requires ctx.blobs when no Node host is paired")
      }
      const copy = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      const buffer = copy.slice().buffer as ArrayBuffer
      const locator = stashCapabilityBlob(ctx.blobs, {
        name: options.name ?? "blob",
        type: options.mediaType,
        size: copy.byteLength,
        arrayBuffer: async () => buffer,
      })
      return {
        kind: FILE_REF_KINDS.FILE,
        path: locator,
        mediaType: options.mediaType,
        sizeBytes: copy.byteLength,
      }
    },
  }
}
