import type { ImageRef } from "@executioncontrolprotocol/types"
import { IMAGE_REF_KINDS } from "@executioncontrolprotocol/types"
import type { OutputOptions } from "./schemas.js"

/** Resolved extension limits. @category Extensions */
export interface ImageSharpLimits {
  maxInputBytes: number
  maxOutputBytes: number
  maxPixels: number
  maxWidth: number
  maxHeight: number
  allowSvgInput: boolean
  allowRemoteUrls: boolean
  maxVariantsPerStep: number
  maxCompositeImages: number
}

const DEFAULT_LIMITS: ImageSharpLimits = {
  maxInputBytes: 50 * 1024 * 1024,
  maxOutputBytes: 50 * 1024 * 1024,
  maxPixels: 80_000_000,
  maxWidth: 16_384,
  maxHeight: 16_384,
  allowSvgInput: true,
  allowRemoteUrls: false,
  maxVariantsPerStep: 16,
  maxCompositeImages: 8,
}

/** Resolve limits from extension config. @category Extensions */
export function resolveLimits(cfg: Record<string, unknown>): ImageSharpLimits {
  const raw = cfg.limits as Partial<ImageSharpLimits> | undefined
  return { ...DEFAULT_LIMITS, ...raw }
}

/** Assert input byte size within limits. @category Extensions */
export function assertInputBytes(sizeBytes: number, limits: ImageSharpLimits): void {
  if (sizeBytes > limits.maxInputBytes) {
    throw new Error(`Input image exceeds maxInputBytes (${limits.maxInputBytes})`)
  }
}

/** Assert output byte size within limits. @category Extensions */
export function assertOutputBytes(sizeBytes: number, limits: ImageSharpLimits): void {
  if (sizeBytes > limits.maxOutputBytes) {
    throw new Error(`Output image exceeds maxOutputBytes (${limits.maxOutputBytes})`)
  }
}

/** Assert dimensions within limits. @category Extensions */
export function assertDimensions(
  width: number | undefined,
  height: number | undefined,
  limits: ImageSharpLimits
): void {
  if (width !== undefined && width > limits.maxWidth) {
    throw new Error(`Image width ${width} exceeds maxWidth (${limits.maxWidth})`)
  }
  if (height !== undefined && height > limits.maxHeight) {
    throw new Error(`Image height ${height} exceeds maxHeight (${limits.maxHeight})`)
  }
  if (width !== undefined && height !== undefined && width * height > limits.maxPixels) {
    throw new Error(`Image pixels ${width * height} exceed maxPixels (${limits.maxPixels})`)
  }
}

/** Validate image ref kind against extension limits. @category Extensions */
export function assertImageRefAllowed(ref: ImageRef, limits: ImageSharpLimits): void {
  if (ref.kind === IMAGE_REF_KINDS.URL && !limits.allowRemoteUrls) {
    throw new Error("Remote URL image refs are disabled")
  }
  if (!limits.allowSvgInput) {
    const mt = ref.kind === IMAGE_REF_KINDS.URL ? undefined : ref.mediaType
    if (mt?.includes("svg")) throw new Error("SVG input is disabled")
  }
  if (
    (ref.kind === IMAGE_REF_KINDS.ARTIFACT || ref.kind === IMAGE_REF_KINDS.FILE) &&
    ref.sizeBytes !== undefined
  ) {
    assertInputBytes(ref.sizeBytes, limits)
  }
}

/** Count composite images in pipeline. @category Extensions */
export function countCompositeImages(
  pipeline: Array<{ op: string; images?: unknown[] }>
): number {
  return pipeline.reduce((sum, op) => {
    if (op.op === "composite" && Array.isArray(op.images)) return sum + op.images.length
    return sum
  }, 0)
}

/** Assert variant and composite counts. @category Extensions */
export function assertPipelineCounts(
  pipeline: Array<{ op: string; images?: unknown[] }>,
  variantCount: number,
  limits: ImageSharpLimits
): void {
  if (variantCount > limits.maxVariantsPerStep) {
    throw new Error(`Variant count ${variantCount} exceeds maxVariantsPerStep`)
  }
  const composites = countCompositeImages(pipeline)
  if (composites > limits.maxCompositeImages) {
    throw new Error(`Composite image count ${composites} exceeds maxCompositeImages`)
  }
}

/** Default output options from extension config. @category Extensions */
export function resolveDefaultOutput(cfg: Record<string, unknown>): OutputOptions {
  const defaults = (cfg.defaults as Partial<OutputOptions> | undefined) ?? {}
  return {
    format: (defaults.format as OutputOptions["format"]) ?? "webp",
    quality: defaults.quality ?? 82,
    stripMetadata: defaults.stripMetadata ?? true,
  }
}
