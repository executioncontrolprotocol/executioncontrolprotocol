import {
  capabilityFor,
  type CapabilityDefinition,
  type CapabilityHandler,
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
import { EXT_ID } from "./shared.js"

/** Handlers for image-sharp capabilities (Node vs browser). @category Extensions */
export interface ImageSharpCapabilityHandlers {
  inspect: CapabilityHandler
  metadata: CapabilityHandler
  stats: CapabilityHandler
  transform: CapabilityHandler
  resize: CapabilityHandler
  crop: CapabilityHandler
  thumbnail: CapabilityHandler
  convert: CapabilityHandler
  composite: CapabilityHandler
  normalize: CapabilityHandler
  derive: CapabilityHandler
}

/**
 * Shared capability shells (schemas + colocated metadata). Host/browser only swap handlers.
 * @category Extensions
 */
export function buildImageSharpCapabilities(
  handlers: ImageSharpCapabilityHandlers,
): CapabilityDefinition[] {
  return [
    capabilityFor(EXT_ID, "inspect")
      .withInput(inspectInputSchema)
      .withOutput(inspectOutputSchema)
      .withMetadata({
        summary: "Inspect image format, dimensions, and optional stats",
        description:
          "Reads an image from a path, URL, artifact, or buffer and returns format metadata, dimensions, orientation, and optional channel statistics without modifying pixels.",
        useCases: [
          "Validate an upload before resize or conversion",
          "Read width, height, and format for layout or model prep",
        ],
        samplePrompts: [
          "What are the dimensions and format of this image?",
          "Inspect the uploaded photo before processing",
        ],
      })
      .withHandler(handlers.inspect),
    capabilityFor(EXT_ID, "metadata")
      .withInput(z.object({ image: inspectInputSchema.shape.image }))
      .withOutput(z.object({ metadata: z.record(z.string(), z.unknown()) }))
      .withMetadata({
        summary: "Read EXIF and embedded image metadata",
        description:
          "Returns embedded metadata such as EXIF tags, density, and orientation for a single image without running a full inspect or transform pipeline.",
        useCases: [
          "Check camera orientation or DPI before normalization",
          "Surface EXIF fields for cataloging or debugging",
        ],
        samplePrompts: [
          "Show the EXIF metadata for this image",
          "Read embedded metadata from the source file",
        ],
      })
      .withHandler(handlers.metadata),
    capabilityFor(EXT_ID, "stats")
      .withInput(z.object({ image: inspectInputSchema.shape.image }))
      .withOutput(z.object({ stats: z.unknown() }))
      .withMetadata({
        summary: "Compute channel statistics for an image",
        description:
          "Calculates per-channel min, max, mean, and related stats for an image, useful for exposure checks and automated quality gates.",
        useCases: [
          "Detect mostly blank or clipped images before publishing",
          "Compare brightness across variants in a batch",
        ],
        samplePrompts: [
          "Get color channel stats for this image",
          "Check whether the photo is mostly white or clipped",
        ],
      })
      .withHandler(handlers.stats),
    capabilityFor(EXT_ID, "transform")
      .withInput(transformInputSchema)
      .withOutput(transformOutputSchema)
      .withMetadata({
        summary: "Run a declarative Sharp pipeline on one image",
        description:
          "Applies an ordered list of resize, crop, rotate, blur, tint, composite, and other Sharp operations, then writes the result as an artifact with chosen format and quality.",
        useCases: [
          "Apply multi-step edits in one workflow step",
          "Express non-trivial image edits as a reusable pipeline",
        ],
        samplePrompts: [
          "Resize to 800px, sharpen slightly, and export as WebP",
          "Rotate, crop, and convert this image in one step",
        ],
      })
      .withHandler(handlers.transform),
    capabilityFor(EXT_ID, "resize")
      .withInput(resizeInputSchema)
      .withOutput(transformOutputSchema)
      .withMetadata({
        summary: "Resize an image to target dimensions",
        description:
          "Scales an image to requested width and height using fit modes such as cover, contain, or inside, with optional enlargement guards and kernel selection.",
        useCases: [
          "Fit product photos to a fixed canvas size",
          "Downscale large uploads before storage or inference",
        ],
        samplePrompts: [
          "Resize the image to 1024 by 768 using cover fit",
          "Scale this photo down to 512px on the longest side",
        ],
      })
      .withHandler(handlers.resize),
    capabilityFor(EXT_ID, "crop")
      .withInput(cropInputSchema)
      .withOutput(transformOutputSchema)
      .withMetadata({
        summary: "Crop a rectangular region from an image",
        description:
          "Extracts a box defined by left, top, width, and height from the source image and returns the cropped result as a new artifact.",
        useCases: [
          "Remove borders or focus on a subject region",
          "Produce square crops for avatars or thumbnails",
        ],
        samplePrompts: [
          "Crop a 400 by 400 square from the center of the image",
          "Extract the region from coordinates 100, 50 with size 600 by 400",
        ],
      })
      .withHandler(handlers.crop),
    capabilityFor(EXT_ID, "thumbnail")
      .withInput(thumbnailInputSchema)
      .withOutput(z.object({ thumbnails: z.record(z.string(), transformOutputSchema) }))
      .withMetadata({
        summary: "Generate multiple named thumbnail sizes",
        description:
          "Builds a map of named thumbnails from one source image, each resized with a shared fit mode and output settings.",
        useCases: [
          "Create responsive image size sets for a gallery",
          "Produce preview, card, and hero sizes in one call",
        ],
        samplePrompts: [
          "Create small, medium, and large thumbnails from this image",
          "Generate 150px and 300px wide preview sizes",
        ],
      })
      .withHandler(handlers.thumbnail),
    capabilityFor(EXT_ID, "convert")
      .withInput(convertInputSchema)
      .withOutput(transformOutputSchema)
      .withMetadata({
        summary: "Convert an image to another format",
        description:
          "Re-encodes a source image to the requested output format and quality without additional geometric transforms.",
        useCases: [
          "Turn PNG uploads into smaller WebP or JPEG assets",
          "Normalize format before sending images to downstream services",
        ],
        samplePrompts: [
          "Convert this PNG to WebP at quality 85",
          "Save the image as JPEG instead of PNG",
        ],
      })
      .withHandler(handlers.convert),
    capabilityFor(EXT_ID, "composite")
      .withInput(compositeInputSchema)
      .withOutput(transformOutputSchema)
      .withMetadata({
        summary: "Layer overlay images onto a base image",
        description:
          "Composites one or more overlay images onto a base image with optional position, gravity, blend mode, and tiling.",
        useCases: [
          "Add a watermark or logo to a photo",
          "Stack badges or stickers on a marketing asset",
        ],
        samplePrompts: [
          "Place the logo overlay in the bottom-right corner",
          "Composite the badge image on top of the product photo",
        ],
      })
      .withHandler(handlers.composite),
    capabilityFor(EXT_ID, "normalize")
      .withInput(normalizeInputSchema)
      .withOutput(transformOutputSchema)
      .withMetadata({
        summary: "Auto-orient, convert to sRGB, and strip metadata",
        description:
          "Applies auto-rotation from EXIF orientation, converts colors to sRGB, and removes embedded metadata for web-safe, consistent output.",
        useCases: [
          "Fix phone photos uploaded with wrong orientation",
          "Prepare images for consistent display across browsers",
        ],
        samplePrompts: [
          "Normalize this photo for web upload",
          "Auto-rotate, convert to sRGB, and strip EXIF data",
        ],
      })
      .withHandler(handlers.normalize),
    capabilityFor(EXT_ID, "derive")
      .withInput(deriveInputSchema)
      .withOutput(deriveOutputSchema)
      .withMetadata({
        summary: "Produce multiple named variants from one source",
        description:
          "Runs independent pipelines for each named variant against the same source image and returns all outputs in one result object.",
        useCases: [
          "Export social, print, and thumbnail variants in one step",
          "Batch custom pipelines for A/B or platform-specific assets",
        ],
        samplePrompts: [
          "Derive hero, card, and icon variants from this image",
          "Generate a grayscale and a resized version from the same source",
        ],
      })
      .withHandler(handlers.derive),
  ]
}
