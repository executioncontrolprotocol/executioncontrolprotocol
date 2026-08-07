import { z } from "zod"
import { imageRefSchema, IMAGE_OUTPUT_FORMATS } from "@executioncontrolprotocol/types"

/** Color input for Sharp operations. @category Extensions */
export const colorInputSchema = z.union([
  z.string(),
  z.object({
    r: z.number().optional(),
    g: z.number().optional(),
    b: z.number().optional(),
    alpha: z.number().optional(),
  }),
])

const resizeOpSchema = z.object({
  op: z.literal("resize"),
  width: z.number().optional(),
  height: z.number().optional(),
  fit: z.enum(["cover", "contain", "fill", "inside", "outside"]).optional(),
  position: z
    .enum([
      "center",
      "top",
      "right top",
      "right",
      "right bottom",
      "bottom",
      "left bottom",
      "left",
      "left top",
      "entropy",
      "attention",
    ])
    .optional(),
  background: colorInputSchema.optional(),
  kernel: z.enum(["nearest", "cubic", "mitchell", "lanczos2", "lanczos3"]).optional(),
  withoutEnlargement: z.boolean().optional(),
  withoutReduction: z.boolean().optional(),
  fastShrinkOnLoad: z.boolean().optional(),
})

const extractOpSchema = z.object({
  op: z.literal("extract"),
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number(),
})

const cropOpSchema = z.object({
  op: z.literal("crop"),
  left: z.number().optional(),
  top: z.number().optional(),
  width: z.number(),
  height: z.number(),
  gravity: z.string().optional(),
  strategy: z.enum(["entropy", "attention"]).optional(),
})

const extendOpSchema = z.object({
  op: z.literal("extend"),
  top: z.number().optional(),
  bottom: z.number().optional(),
  left: z.number().optional(),
  right: z.number().optional(),
  background: colorInputSchema.optional(),
})

const trimOpSchema = z.object({
  op: z.literal("trim"),
  background: colorInputSchema.optional(),
  threshold: z.number().optional(),
})

const rotateOpSchema = z.object({
  op: z.literal("rotate"),
  angle: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270), z.number()]).optional(),
  auto: z.boolean().optional(),
  background: colorInputSchema.optional(),
})

const flipOpSchema = z.object({ op: z.literal("flip") })
const flopOpSchema = z.object({ op: z.literal("flop") })

const affineOpSchema = z.object({
  op: z.literal("affine"),
  matrix: z.array(z.array(z.number())),
  background: colorInputSchema.optional(),
  idx: z.number().optional(),
  idy: z.number().optional(),
  odx: z.number().optional(),
  ody: z.number().optional(),
})

const compositeLayerSchema = z.object({
  image: imageRefSchema,
  left: z.number().optional(),
  top: z.number().optional(),
  gravity: z.string().optional(),
  blend: z.string().optional(),
  opacity: z.number().optional(),
  tile: z.boolean().optional(),
  premultiplied: z.boolean().optional(),
  density: z.number().optional(),
})

const compositeOpSchema = z.object({
  op: z.literal("composite"),
  images: z.array(compositeLayerSchema),
})

const flattenOpSchema = z.object({
  op: z.literal("flatten"),
  background: colorInputSchema.optional(),
})

const ensureAlphaOpSchema = z.object({
  op: z.literal("ensureAlpha"),
  alpha: z.number().optional(),
})

const removeAlphaOpSchema = z.object({ op: z.literal("removeAlpha") })

const backgroundOpSchema = z.object({
  op: z.literal("background"),
  color: colorInputSchema,
})

const blurOpSchema = z.object({
  op: z.literal("blur"),
  sigma: z.union([z.number(), z.boolean()]).optional(),
})

const sharpenOpSchema = z.object({
  op: z.literal("sharpen"),
  sigma: z.number().optional(),
  m1: z.number().optional(),
  m2: z.number().optional(),
  x1: z.number().optional(),
  y2: z.number().optional(),
  y3: z.number().optional(),
})

const medianOpSchema = z.object({
  op: z.literal("median"),
  size: z.number().optional(),
})

const greyscaleOpSchema = z.object({ op: z.literal("greyscale") })
const negateOpSchema = z.object({
  op: z.literal("negate"),
  alpha: z.boolean().optional(),
})

const normalizeOpSchema = z.object({
  op: z.literal("normalize"),
  lower: z.number().optional(),
  upper: z.number().optional(),
})

const linearOpSchema = z.object({
  op: z.literal("linear"),
  a: z.union([z.number(), z.array(z.number())]).optional(),
  b: z.union([z.number(), z.array(z.number())]).optional(),
})

const modulateOpSchema = z.object({
  op: z.literal("modulate"),
  brightness: z.number().optional(),
  saturation: z.number().optional(),
  hue: z.number().optional(),
  lightness: z.number().optional(),
})

const tintOpSchema = z.object({
  op: z.literal("tint"),
  color: colorInputSchema,
})

const gammaOpSchema = z.object({
  op: z.literal("gamma"),
  gamma: z.number().optional(),
  gammaOut: z.number().optional(),
})

const thresholdOpSchema = z.object({
  op: z.literal("threshold"),
  threshold: z.number().optional(),
  greyscale: z.boolean().optional(),
})

const booleanOpSchema = z.object({
  op: z.literal("boolean"),
  image: imageRefSchema,
  operator: z.enum(["and", "or", "eor"]),
})

const convolveOpSchema = z.object({
  op: z.literal("convolve"),
  width: z.number(),
  height: z.number(),
  kernel: z.array(z.number()),
  scale: z.number().optional(),
  offset: z.number().optional(),
})

const recombOpSchema = z.object({
  op: z.literal("recomb"),
  matrix: z.array(z.array(z.number())),
})

const colorspaceOpSchema = z.object({
  op: z.literal("colorspace"),
  space: z.enum(["srgb", "rgb", "cmyk", "lab", "b-w"]),
})

const metadataOpSchema = z.object({
  op: z.literal("metadata"),
  orientation: z.number().optional(),
  density: z.number().optional(),
})

/** Declarative Sharp pipeline operation. @category Extensions */
export const sharpPipelineOperationSchema = z.discriminatedUnion("op", [
  resizeOpSchema,
  extractOpSchema,
  cropOpSchema,
  extendOpSchema,
  trimOpSchema,
  rotateOpSchema,
  flipOpSchema,
  flopOpSchema,
  affineOpSchema,
  compositeOpSchema,
  flattenOpSchema,
  ensureAlphaOpSchema,
  removeAlphaOpSchema,
  backgroundOpSchema,
  blurOpSchema,
  sharpenOpSchema,
  medianOpSchema,
  greyscaleOpSchema,
  negateOpSchema,
  normalizeOpSchema,
  linearOpSchema,
  modulateOpSchema,
  tintOpSchema,
  gammaOpSchema,
  thresholdOpSchema,
  booleanOpSchema,
  convolveOpSchema,
  recombOpSchema,
  colorspaceOpSchema,
  metadataOpSchema,
])

export type SharpPipelineOperation = z.infer<typeof sharpPipelineOperationSchema>

const outputFormatEnum = z.enum([
  IMAGE_OUTPUT_FORMATS.JPEG,
  IMAGE_OUTPUT_FORMATS.PNG,
  IMAGE_OUTPUT_FORMATS.WEBP,
  IMAGE_OUTPUT_FORMATS.AVIF,
  IMAGE_OUTPUT_FORMATS.TIFF,
  IMAGE_OUTPUT_FORMATS.GIF,
  IMAGE_OUTPUT_FORMATS.RAW,
])

/** Output options for image processing capabilities. @category Extensions */
export const outputOptionsSchema = z.object({
  format: outputFormatEnum.optional(),
  quality: z.number().optional(),
  effort: z.number().optional(),
  progressive: z.boolean().optional(),
  compressionLevel: z.number().optional(),
  lossless: z.boolean().optional(),
  nearLossless: z.boolean().optional(),
  stripMetadata: z.boolean().optional(),
  preserveMetadata: z.boolean().optional(),
  artifact: z
    .object({
      store: z.string().optional(),
      name: z.string().optional(),
      prefix: z.string().optional(),
    })
    .optional(),
})

export type OutputOptions = z.infer<typeof outputOptionsSchema>

/** Transform capability input. @category Extensions */
export const transformInputSchema = z.object({
  image: imageRefSchema,
  pipeline: z.array(sharpPipelineOperationSchema).default([]),
  output: outputOptionsSchema.optional(),
  animated: z.boolean().optional(),
  failOn: z.enum(["none", "truncated", "error", "warning"]).optional(),
})

/** Transform capability output. @category Extensions */
export const transformOutputSchema = z.object({
  image: imageRefSchema,
  info: z.object({
    format: z.string(),
    width: z.number(),
    height: z.number(),
    channels: z.number(),
    sizeBytes: z.number(),
    premultiplied: z.boolean().optional(),
    cropOffsetLeft: z.number().optional(),
    cropOffsetTop: z.number().optional(),
  }),
  operations: z.array(sharpPipelineOperationSchema).optional(),
  source: z
    .object({
      image: imageRefSchema,
    })
    .optional(),
})

/** Inspect capability input. @category Extensions */
export const inspectInputSchema = z.object({
  image: imageRefSchema,
  include: z
    .array(z.enum(["metadata", "stats", "dominantColor", "hash"]))
    .optional(),
  animated: z.boolean().optional(),
  failOn: z.enum(["none", "truncated", "error", "warning"]).optional(),
})

/** Inspect capability output. @category Extensions */
export const inspectOutputSchema = z.object({
  image: imageRefSchema,
  metadata: z.record(z.string(), z.unknown()),
  stats: z.unknown().optional(),
  derived: z.object({
    aspectRatio: z.number().optional(),
    orientation: z.enum(["landscape", "portrait", "square", "unknown"]),
    megapixels: z.number().optional(),
  }),
})

/** Derive variant definition. @category Extensions */
export const deriveVariantSchema = z.object({
  name: z.string(),
  pipeline: z.array(sharpPipelineOperationSchema).default([]),
  output: outputOptionsSchema.optional(),
})

/** Derive capability input. @category Extensions */
export const deriveInputSchema = z.object({
  image: imageRefSchema,
  variants: z.array(deriveVariantSchema),
})

/** Derive capability output. @category Extensions */
export const deriveOutputSchema = z.object({
  variants: z.record(z.string(), transformOutputSchema),
  source: z.object({ image: imageRefSchema }),
})

/** Resize convenience input. @category Extensions */
export const resizeInputSchema = transformInputSchema.extend({
  width: z.number().optional(),
  height: z.number().optional(),
  fit: resizeOpSchema.shape.fit,
  position: resizeOpSchema.shape.position,
  kernel: resizeOpSchema.shape.kernel,
  withoutEnlargement: z.boolean().optional(),
  withoutReduction: z.boolean().optional(),
})

/** Crop convenience input. @category Extensions */
export const cropInputSchema = z.object({
  image: imageRefSchema,
  box: z.object({
    left: z.number(),
    top: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  output: outputOptionsSchema.optional(),
})

/** Thumbnail size entry. @category Extensions */
export const thumbnailSizeSchema = z.object({
  name: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
})

/** Thumbnail convenience input. @category Extensions */
export const thumbnailInputSchema = z.object({
  image: imageRefSchema,
  sizes: z.array(thumbnailSizeSchema),
  fit: resizeOpSchema.shape.fit.optional(),
  output: outputOptionsSchema.optional(),
})

/** Composite convenience input. @category Extensions */
export const compositeInputSchema = z.object({
  image: imageRefSchema,
  overlays: z.array(compositeLayerSchema),
  output: outputOptionsSchema.optional(),
})

/** Convert convenience input. @category Extensions */
export const convertInputSchema = z.object({
  image: imageRefSchema,
  output: outputOptionsSchema,
})

/** Normalize convenience input. @category Extensions */
export const normalizeInputSchema = z.object({
  image: imageRefSchema,
  output: outputOptionsSchema.optional(),
})
