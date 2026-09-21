import {
  catalogExtension,
  globalRegistry,
  type Registry,
} from "@executioncontrolprotocol/core"
import { z } from "zod"
import {
  transformInputSchema,
  transformOutputSchema,
  inspectInputSchema,
  deriveInputSchema,
  resizeInputSchema,
  cropInputSchema,
  thumbnailInputSchema,
  compositeInputSchema,
  convertInputSchema,
  normalizeInputSchema,
} from "./schemas.js"
import { runPipeline, runInspect } from "./sharp-runner.js"
import { buildImageSharpCapabilities } from "./capability-catalog.js"
import { buildImageSharpExtension, EXT_ID } from "./shared.js"

/** @executioncontrolprotocol/image-sharp extension. @category Extensions */
export const imageSharpExtension = buildImageSharpExtension(
  buildImageSharpCapabilities({
    inspect: async (input, ctx) => {
      const parsed = input as z.infer<typeof inspectInputSchema>
      return runInspect(
        parsed.image,
        parsed.include,
        ctx as Parameters<typeof runInspect>[2],
        parsed.animated,
        parsed.failOn,
      )
    },
    metadata: async (input, ctx) => {
      const parsed = input as { image: z.infer<typeof inspectInputSchema>["image"] }
      const result = await runInspect(
        parsed.image,
        ["metadata"],
        ctx as Parameters<typeof runInspect>[2],
      )
      return { metadata: result.metadata }
    },
    stats: async (input, ctx) => {
      const parsed = input as { image: z.infer<typeof inspectInputSchema>["image"] }
      const result = await runInspect(
        parsed.image,
        ["stats"],
        ctx as Parameters<typeof runInspect>[2],
      )
      return { stats: result.stats }
    },
    transform: async (input, ctx) => {
      const parsed = input as z.infer<typeof transformInputSchema>
      return runPipeline(
        {
          image: parsed.image,
          pipeline: parsed.pipeline,
          output: parsed.output,
          animated: parsed.animated,
          failOn: parsed.failOn,
        },
        ctx as Parameters<typeof runPipeline>[1],
      )
    },
    resize: async (input, ctx) => {
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
        ctx as Parameters<typeof runPipeline>[1],
      )
    },
    crop: async (input, ctx) => {
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
        ctx as Parameters<typeof runPipeline>[1],
      )
    },
    thumbnail: async (input, ctx) => {
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
          ctx as Parameters<typeof runPipeline>[1],
        )
      }
      return { thumbnails }
    },
    convert: async (input, ctx) => {
      const parsed = input as z.infer<typeof convertInputSchema>
      return runPipeline(
        { image: parsed.image, pipeline: [], output: parsed.output },
        ctx as Parameters<typeof runPipeline>[1],
      )
    },
    composite: async (input, ctx) => {
      const parsed = input as z.infer<typeof compositeInputSchema>
      return runPipeline(
        {
          image: parsed.image,
          pipeline: [{ op: "composite", images: parsed.overlays }],
          output: parsed.output,
        },
        ctx as Parameters<typeof runPipeline>[1],
      )
    },
    normalize: async (input, ctx) => {
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
        ctx as Parameters<typeof runPipeline>[1],
      )
    },
    derive: async (input, ctx) => {
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
          ctx as Parameters<typeof runPipeline>[1],
        )
      }
      return { variants, source: { image: parsed.image } }
    },
  }),
)

catalogExtension(imageSharpExtension)

/** Register @executioncontrolprotocol/image-sharp. */
export async function registerImageSharpExtension(registry: Registry = globalRegistry): Promise<void> {
  if (!registry.getExtension(EXT_ID)) {
    await registry.registerExtension(imageSharpExtension)
  }
}

export { clearImageArtifactStore } from "./artifact.js"
export default imageSharpExtension
