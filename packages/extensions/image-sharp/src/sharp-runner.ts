import type { SharpOptions } from "sharp"
import type { ImageRef } from "@executioncontrolprotocol/types"
import type { CapabilityContext } from "@executioncontrolprotocol/core"
import { readImageToBuffer, writeArtifact, mediaTypeForFormat } from "./artifact.js"
import { applyOperation } from "./operations.js"
import { applyOutputOptions } from "./output.js"
import {
  assertDimensions,
  assertImageRefAllowed,
  assertOutputBytes,
  assertPipelineCounts,
  resolveDefaultOutput,
  resolveLimits,
} from "./limits.js"
import type { OutputOptions, SharpPipelineOperation, transformOutputSchema } from "./schemas.js"
import type { z } from "zod"

type Ctx = CapabilityContext & { extensionConfig?: Record<string, unknown> }
type TransformOutput = z.infer<typeof transformOutputSchema>

type SharpModule = typeof import("sharp")

const SHARP_UNAVAILABLE_MESSAGE =
  "image-sharp requires the native sharp module (Node runtime). Image processing steps cannot run in the browser."

async function loadSharp(): Promise<SharpModule> {
  try {
    const mod = await import("sharp")
    return mod.default
  } catch {
    throw new Error(SHARP_UNAVAILABLE_MESSAGE)
  }
}

/** Options for {@link runPipeline}. @category Extensions */
export interface RunPipelineOptions {
  image: ImageRef
  pipeline: SharpPipelineOperation[]
  output?: OutputOptions
  animated?: boolean
  failOn?: "none" | "truncated" | "error" | "warning"
  variantCount?: number
}

/** Run a Sharp pipeline and write output artifact. @category Extensions */
export async function runPipeline(
  options: RunPipelineOptions,
  ctx: Ctx
): Promise<TransformOutput> {
  const sharp = await loadSharp()
  const cfg = ctx.extensionConfig ?? {}
  const limits = resolveLimits(cfg)
  const defaults = resolveDefaultOutput(cfg)

  assertImageRefAllowed(options.image, limits)
  assertPipelineCounts(options.pipeline, options.variantCount ?? 1, limits)

  const source = await readImageToBuffer(options.image, ctx)
  const failOn = options.failOn ?? (cfg.defaults as { failOn?: string } | undefined)?.failOn ?? "warning"

  let instance = sharp(source.buffer, {
    failOn: failOn as SharpOptions["failOn"],
    animated: options.animated ?? true,
    limitInputPixels: limits.maxPixels,
  })

  for (const op of options.pipeline) {
    instance = await applyOperation(instance, op, ctx)
  }

  instance = applyOutputOptions(instance, options.output, defaults)

  const { data, info } = await instance.toBuffer({ resolveWithObject: true })
  assertOutputBytes(data.length, limits)
  assertDimensions(info.width, info.height, limits)

  const format = info.format ?? defaults.format ?? "webp"
  const image = await writeArtifact(data, {
    mediaType: mediaTypeForFormat(format),
    name: options.output?.artifact?.name,
    prefix: options.output?.artifact?.prefix,
    store: options.output?.artifact?.store,
  }, ctx)

  return {
    image,
    info: {
      format,
      width: info.width,
      height: info.height,
      channels: info.channels,
      sizeBytes: data.length,
      premultiplied: info.premultiplied,
      cropOffsetLeft: info.cropOffsetLeft,
      cropOffsetTop: info.cropOffsetTop,
    },
    operations: options.pipeline,
    source: { image: options.image },
  }
}

/** Run inspect-only pass on an image. @category Extensions */
export async function runInspect(
  imageRef: ImageRef,
  include: string[] | undefined,
  ctx: Ctx,
  animated?: boolean,
  failOn?: "none" | "truncated" | "error" | "warning"
) {
  const sharp = await loadSharp()
  const cfg = ctx.extensionConfig ?? {}
  const limits = resolveLimits(cfg)
  assertImageRefAllowed(imageRef, limits)
  const source = await readImageToBuffer(imageRef, ctx)

  const instance = sharp(source.buffer, {
    failOn: (failOn ?? "warning") as SharpOptions["failOn"],
    animated: animated ?? true,
    limitInputPixels: limits.maxPixels,
  })

  const metadata = await instance.metadata()
  assertDimensions(metadata.width, metadata.height, limits)

  const stats = include?.includes("stats") ? await sharp(source.buffer).stats() : undefined

  const { deriveImageFacts } = await import("./derive-facts.js")
  return {
    image: imageRef,
    metadata: { ...metadata } as Record<string, unknown>,
    stats,
    derived: deriveImageFacts(metadata, stats),
  }
}
