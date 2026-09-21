import type { FileRef } from "@executioncontrolprotocol/types"
import {
  assertMediaType,
  resolveFile,
  writeMediaArtifact,
  type FileCapabilityContext,
  type ResolvedFile,
  type WriteMediaArtifactOptions,
} from "@executioncontrolprotocol/core"

/** Read image result (Buffer for Sharp). @category Extensions */
export interface ReadImageResult {
  /** Image bytes. */
  buffer: Buffer
  /** MIME type when known. */
  mediaType?: string
  /** Byte size. */
  sizeBytes: number
}

type Ctx = FileCapabilityContext

/** Expected MIME types for image inputs after {@link resolveFile}. */
export const IMAGE_INPUT_MEDIA_TYPES = "image/*"

/**
 * Resolve a {@link FileRef} to a Node Buffer via core {@link resolveFile}.
 * @category Extensions
 */
export async function readImageToBuffer(ref: FileRef, ctx: Ctx): Promise<ReadImageResult> {
  const resolved: ResolvedFile = await resolveFile(ref, ctx)
  assertMediaType(resolved.mediaType, IMAGE_INPUT_MEDIA_TYPES)
  return {
    buffer: Buffer.from(resolved.bytes),
    mediaType: resolved.mediaType,
    sizeBytes: resolved.sizeBytes,
  }
}

/** Write artifact options. @category Extensions */
export type WriteArtifactOptions = WriteMediaArtifactOptions

/**
 * Write buffer as artifact {@link FileRef} via core {@link writeMediaArtifact}.
 * @category Extensions
 */
export async function writeArtifact(
  data: Buffer,
  options: WriteArtifactOptions,
  ctx: Ctx
): Promise<FileRef> {
  const prefix = options.prefix ?? "artifacts/images"
  return writeMediaArtifact(new Uint8Array(data), { ...options, prefix }, ctx)
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

/** Default artifact basename for a Sharp output format. @category Extensions */
export function defaultArtifactNameForFormat(format: string): string {
  const ext = format === "jpeg" ? "jpg" : format
  return `output.${ext}`
}

/** @deprecated Legacy no-op; use `ctx.artifacts` from the runtime. @category Extensions */
export function clearImageArtifactStore(): void {
  // Artifacts live on CapabilityContext.artifacts (core).
}
