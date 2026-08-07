import type { ImageRef } from "@executioncontrolprotocol/types"
import { IMAGE_REF_KINDS } from "@executioncontrolprotocol/types"
import type { CapabilityContext } from "@executioncontrolprotocol/core"

/** Read image result. @category Extensions */
export interface ReadImageResult {
  /** Image bytes. */
  buffer: Buffer
  /** MIME type when known. */
  mediaType?: string
  /** Byte size. */
  sizeBytes: number
}

const artifactStore = new Map<string, Buffer>()

/** Clear in-memory artifact store (tests). @category Extensions */
export function clearImageArtifactStore(): void {
  artifactStore.clear()
}

async function readFileFromPath(path: string): Promise<Buffer> {
  const fs = await import("node:fs/promises").catch(() => null)
  if (!fs?.readFile) {
    throw new Error("File image refs require Node.js (node:fs/promises is not available in this runtime)")
  }
  return fs.readFile(path)
}

/** Read image reference to buffer. @category Extensions */
export async function readImageToBuffer(
  ref: ImageRef,
  ctx: CapabilityContext & { extensionConfig?: Record<string, unknown> }
): Promise<ReadImageResult> {
  const cfg = ctx.extensionConfig ?? {}
  const limits = (cfg.limits as { allowRemoteUrls?: boolean } | undefined) ?? {}

  switch (ref.kind) {
    case IMAGE_REF_KINDS.BUFFER: {
      const buffer = Buffer.from(ref.data, "base64")
      return { buffer, mediaType: ref.mediaType, sizeBytes: buffer.length }
    }
    case IMAGE_REF_KINDS.FILE: {
      const buffer = await readFileFromPath(ref.path)
      return { buffer, mediaType: ref.mediaType, sizeBytes: buffer.length }
    }
    case IMAGE_REF_KINDS.URL: {
      if (!limits.allowRemoteUrls) {
        throw new Error("Remote URL image refs are disabled (limits.allowRemoteUrls)")
      }
      const res = await fetch(ref.url, { headers: ref.headers })
      if (!res.ok) throw new Error(`Failed to fetch image URL: ${res.status}`)
      const arrayBuf = await res.arrayBuffer()
      const buffer = Buffer.from(arrayBuf)
      const mediaType = ref.mediaType ?? res.headers.get("content-type") ?? undefined
      return { buffer, mediaType, sizeBytes: buffer.length }
    }
    case IMAGE_REF_KINDS.ARTIFACT: {
      if (ref.uri.startsWith("ecp://storage/")) {
        const key = ref.uri.slice("ecp://storage/".length)
        const result = (await ctx.capabilities.call("@executioncontrolprotocol/storage.read", {
          key,
        })) as { value?: unknown }
        if (result.value instanceof Uint8Array) {
          const buffer = Buffer.from(result.value)
          return { buffer, mediaType: ref.mediaType, sizeBytes: buffer.length }
        }
        if (typeof result.value === "string") {
          const buffer = Buffer.from(result.value, "base64")
          return { buffer, mediaType: ref.mediaType, sizeBytes: buffer.length }
        }
        throw new Error(`Artifact not found: ${ref.uri}`)
      }
      const stored = artifactStore.get(ref.uri)
      if (!stored) throw new Error(`Artifact not found: ${ref.uri}`)
      return { buffer: stored, mediaType: ref.mediaType, sizeBytes: stored.length }
    }
    default:
      throw new Error("Unsupported image reference kind")
  }
}

/** Write artifact options. @category Extensions */
export interface WriteArtifactOptions {
  /** MIME type. */
  mediaType: string
  /** Optional filename. */
  name?: string
  /** Optional prefix. */
  prefix?: string
  /** Optional store id. */
  store?: string
}

/** Write buffer as artifact reference. @category Extensions */
export async function writeArtifact(
  data: Buffer,
  options: WriteArtifactOptions,
  ctx: CapabilityContext & { extensionConfig?: Record<string, unknown> }
): Promise<ImageRef> {
  const cfg = ctx.extensionConfig ?? {}
  const storage = (cfg.storage as { outputPrefix?: string; defaultStore?: string } | undefined) ?? {}
  const prefix = options.prefix ?? storage.outputPrefix ?? "artifacts/images"
  const name = options.name ?? `image-${Date.now()}.bin`
  const uri = `ecp://${prefix}/${name}`

  if (options.store === "storage" || storage.defaultStore === "storage") {
    const key = `${prefix}/${name}`
    await ctx.capabilities.call("@executioncontrolprotocol/storage.write", {
      key,
      value: data,
    })
    return {
      kind: IMAGE_REF_KINDS.ARTIFACT,
      uri: `ecp://storage/${key}`,
      mediaType: options.mediaType,
      name,
      sizeBytes: data.length,
    }
  }

  artifactStore.set(uri, data)
  return {
    kind: IMAGE_REF_KINDS.ARTIFACT,
    uri,
    mediaType: options.mediaType,
    name,
    sizeBytes: data.length,
  }
}

/** Map Sharp format to MIME type. @category Extensions */
export function mediaTypeForFormat(format: string): string {
  switch (format) {
    case "jpeg":
    case "jpg":
      return "image/jpeg"
    case "png":
      return "image/png"
    case "webp":
      return "image/webp"
    case "avif":
      return "image/avif"
    case "tiff":
      return "image/tiff"
    case "gif":
      return "image/gif"
    default:
      return `image/${format}`
  }
}
