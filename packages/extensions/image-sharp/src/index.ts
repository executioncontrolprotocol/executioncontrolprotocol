import {
  defineExtension,
  capabilityFor,
  globalRegistry,
  catalogExtension,
  type Registry,
  type CapabilityDefinition,
} from "@executioncontrolprotocol/core"
import { z } from "zod"
import {
  transformInputSchema,
  transformOutputSchema,
  inspectInputSchema,
  inspectOutputSchema,
  deriveInputSchema,
  deriveOutputSchema,
  resizeInputSchema,
  cropInputSchema,
  thumbnailInputSchema,
  compositeInputSchema,
  convertInputSchema,
  normalizeInputSchema,
} from "./schemas.js"
import { runPipeline, runInspect } from "./sharp-runner.js"

const EXT_ID = "@executioncontrolprotocol/image-sharp"
const NODE_RUNTIME_ID = "@executioncontrolprotocol/node" as const
const BROWSER_RUNTIME_ID = "@executioncontrolprotocol/browser" as const

function caps(): CapabilityDefinition[] {
  return [
    capabilityFor(EXT_ID, "inspect")
      .withInput(inspectInputSchema)
      .withOutput(inspectOutputSchema)
      .withHandler(async (input, ctx) => {
        const parsed = input as z.infer<typeof inspectInputSchema>
        return runInspect(
          parsed.image,
          parsed.include,
          ctx as Parameters<typeof runInspect>[2],
          parsed.animated,
          parsed.failOn
        )
      }),
    capabilityFor(EXT_ID, "metadata")
      .withInput(z.object({ image: inspectInputSchema.shape.image }))
      .withOutput(z.object({ metadata: z.record(z.string(), z.unknown()) }))
      .withHandler(async (input, ctx) => {
        const parsed = input as { image: z.infer<typeof inspectInputSchema>["image"] }
        const result = await runInspect(parsed.image, ["metadata"], ctx as Parameters<typeof runInspect>[2])
        return { metadata: result.metadata }
      }),
    capabilityFor(EXT_ID, "stats")
      .withInput(z.object({ image: inspectInputSchema.shape.image }))
      .withOutput(z.object({ stats: z.unknown() }))
      .withHandler(async (input, ctx) => {
        const parsed = input as { image: z.infer<typeof inspectInputSchema>["image"] }
        const result = await runInspect(parsed.image, ["stats"], ctx as Parameters<typeof runInspect>[2])
        return { stats: result.stats }
      }),
    capabilityFor(EXT_ID, "transform")
      .withInput(transformInputSchema)
      .withOutput(transformOutputSchema)
      .withHandler(async (input, ctx) => {
        const parsed = input as z.infer<typeof transformInputSchema>
        return runPipeline(
          {
            image: parsed.image,
            pipeline: parsed.pipeline,
            output: parsed.output,
            animated: parsed.animated,
            failOn: parsed.failOn,
          },
          ctx as Parameters<typeof runPipeline>[1]
        )
      }),
    capabilityFor(EXT_ID, "resize")
      .withInput(resizeInputSchema)
      .withOutput(transformOutputSchema)
      .withHandler(async (input, ctx) => {
        const parsed = input as z.infer<typeof resizeInputSchema>
        return runPipeline(
          {
            image: parsed.image,
            pipeline: [
              {
                op: "resize",
                width: parsed.width,
                height: parsed.height,
                fit: parsed.fit,
                position: parsed.position,
                kernel: parsed.kernel,
                withoutEnlargement: parsed.withoutEnlargement,
                withoutReduction: parsed.withoutReduction,
              },
            ],
            output: parsed.output,
            animated: parsed.animated,
            failOn: parsed.failOn,
          },
          ctx as Parameters<typeof runPipeline>[1]
        )
      }),
    capabilityFor(EXT_ID, "crop")
      .withInput(cropInputSchema)
      .withOutput(transformOutputSchema)
      .withHandler(async (input, ctx) => {
        const parsed = input as z.infer<typeof cropInputSchema>
        return runPipeline(
          {
            image: parsed.image,
            pipeline: [
              {
                op: "extract",
                left: parsed.box.left,
                top: parsed.box.top,
                width: parsed.box.width,
                height: parsed.box.height,
              },
            ],
            output: parsed.output,
          },
          ctx as Parameters<typeof runPipeline>[1]
        )
      }),
    capabilityFor(EXT_ID, "thumbnail")
      .withInput(thumbnailInputSchema)
      .withOutput(z.object({ thumbnails: z.record(z.string(), transformOutputSchema) }))
      .withHandler(async (input, ctx) => {
        const parsed = input as z.infer<typeof thumbnailInputSchema>
        const thumbnails: Record<string, z.infer<typeof transformOutputSchema>> = {}
        for (const size of parsed.sizes) {
          thumbnails[size.name] = await runPipeline(
            {
              image: parsed.image,
              pipeline: [
                {
                  op: "resize",
                  width: size.width,
                  height: size.height,
                  fit: parsed.fit ?? "inside",
                },
              ],
              output: parsed.output,
              variantCount: parsed.sizes.length,
            },
            ctx as Parameters<typeof runPipeline>[1]
          )
        }
        return { thumbnails }
      }),
    capabilityFor(EXT_ID, "convert")
      .withInput(convertInputSchema)
      .withOutput(transformOutputSchema)
      .withHandler(async (input, ctx) => {
        const parsed = input as z.infer<typeof convertInputSchema>
        return runPipeline(
          { image: parsed.image, pipeline: [], output: parsed.output },
          ctx as Parameters<typeof runPipeline>[1]
        )
      }),
    capabilityFor(EXT_ID, "composite")
      .withInput(compositeInputSchema)
      .withOutput(transformOutputSchema)
      .withHandler(async (input, ctx) => {
        const parsed = input as z.infer<typeof compositeInputSchema>
        return runPipeline(
          {
            image: parsed.image,
            pipeline: [{ op: "composite", images: parsed.overlays }],
            output: parsed.output,
          },
          ctx as Parameters<typeof runPipeline>[1]
        )
      }),
    capabilityFor(EXT_ID, "normalize")
      .withInput(normalizeInputSchema)
      .withOutput(transformOutputSchema)
      .withHandler(async (input, ctx) => {
        const parsed = input as z.infer<typeof normalizeInputSchema>
        return runPipeline(
          {
            image: parsed.image,
            pipeline: [
              { op: "rotate", auto: true },
              { op: "colorspace", space: "srgb" },
            ],
            output: { stripMetadata: true, ...parsed.output },
          },
          ctx as Parameters<typeof runPipeline>[1]
        )
      }),
    capabilityFor(EXT_ID, "derive")
      .withInput(deriveInputSchema)
      .withOutput(deriveOutputSchema)
      .withHandler(async (input, ctx) => {
        const parsed = input as z.infer<typeof deriveInputSchema>
        const variants: Record<string, z.infer<typeof transformOutputSchema>> = {}
        for (const variant of parsed.variants) {
          variants[variant.name] = await runPipeline(
            {
              image: parsed.image,
              pipeline: variant.pipeline,
              output: variant.output,
              variantCount: parsed.variants.length,
            },
            ctx as Parameters<typeof runPipeline>[1]
          )
        }
        return { variants, source: { image: parsed.image } }
      }),
  ]
}

/** @executioncontrolprotocol/image-sharp extension. @category Extensions */
export const imageSharpExtension = defineExtension("@executioncontrolprotocol", "image-sharp")
  .withSupportedRuntimes([NODE_RUNTIME_ID, BROWSER_RUNTIME_ID])
  .withConfig({
    storage: z
      .object({
        defaultStore: z.string().optional(),
        tempPrefix: z.string().default("tmp/image-sharp"),
        outputPrefix: z.string().default("artifacts/images"),
      })
      .optional(),
    limits: z
      .object({
        maxInputBytes: z.number().default(50 * 1024 * 1024),
        maxOutputBytes: z.number().default(50 * 1024 * 1024),
        maxPixels: z.number().default(80_000_000),
        maxWidth: z.number().default(16_384),
        maxHeight: z.number().default(16_384),
        allowSvgInput: z.boolean().default(true),
        allowRemoteUrls: z.boolean().default(false),
        maxVariantsPerStep: z.number().default(16),
        maxCompositeImages: z.number().default(8),
      })
      .optional(),
    defaults: z
      .object({
        format: z.string().default("webp"),
        quality: z.number().default(82),
        stripMetadata: z.boolean().default(true),
        failOn: z.enum(["none", "truncated", "error", "warning"]).default("warning"),
      })
      .optional(),
    concurrency: z
      .object({
        sharpConcurrency: z.number().optional(),
      })
      .optional(),
  })
  .withCapabilities(caps())
  .build()

catalogExtension(imageSharpExtension)

/** Register @executioncontrolprotocol/image-sharp. */
export async function registerImageSharpExtension(registry: Registry = globalRegistry): Promise<void> {
  if (!registry.getExtension(EXT_ID)) {
    await registry.registerExtension(imageSharpExtension)
  }
}

export { clearImageArtifactStore } from "./artifact.js"
export default imageSharpExtension
