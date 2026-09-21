import { defineExtension, type CapabilityDefinition, type ExtensionDefinition } from "@executioncontrolprotocol/core"
import { z } from "zod"

/** Extension id. @category Extensions */
export const EXT_ID = "@executioncontrolprotocol/image-sharp"

/** Node runtime id. @category Extensions */
export const NODE_RUNTIME_ID = "@executioncontrolprotocol/node" as const

/** Thrown if a host Sharp handler is invoked in the browser catalog (dispatch should hop first). @category Extensions */
export const HOST_HOP_MESSAGE =
  "Capability requires a local host. Start `ecp up --env …`."

/**
 * Build the Sharp extension from a capability list.
 * @category Extensions
 */
export function buildImageSharpExtension(
  capabilities: CapabilityDefinition[],
): ExtensionDefinition {
  return defineExtension("@executioncontrolprotocol", "image-sharp")
    .withSupportedRuntimes([NODE_RUNTIME_ID])
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
    .withMetadata({
      summary: "Resize, convert, inspect, and batch-process images with Sharp",
      description:
        "Local image processing for workflows that need format conversion, resizing, cropping, compositing, thumbnails, or multi-variant exports. Runs on the Node host with configurable size and variant limits.",
      useCases: [
        "Prepare uploaded images for web delivery or model input",
        "Generate thumbnail sets or named variants from one source image",
        "Inspect dimensions, format, and color stats before downstream steps",
      ],
      samplePrompts: [
        "Convert this PNG to WebP and resize to 1200px wide",
        "Generate small, medium, and large thumbnails from the hero image",
      ],
    })
    .withCapabilities(capabilities)
    .build()
}
