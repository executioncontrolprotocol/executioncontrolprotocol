# Sharp image extension design

Yes â€” Sharp is a very good fit for an ECP image extension because it is fast, Node-native, stream/buffer/file friendly, and already covers the core primitives you listed: resizing, extraction/cropping, rotation, compositing, format conversion, metadata, and output inspection. Sharp supports common input formats including JPEG, PNG, WebP, GIF, AVIF, TIFF, and SVG, and can output JPEG, PNG, WebP, GIF, AVIF, TIFF, and raw pixel data. It also supports streams, buffers, and filesystem input/output. ([sharp][1])

The ECP way to expose this should not be â€œone capability per tiny Sharp methodâ€ only. I would build it as a **typed image-processing extension** with both low-level atomic capabilities and one high-level pipeline capability.

# Recommended package

```txt
packages/extensions/image-sharp/
  package.json
  src/
    index.ts
    schemas.ts
    artifact.ts
    sharp-runner.ts
    operations.ts
    capabilities/
      inspect.ts
      transform.ts
      derive.ts
      compare.ts
      normalize.ts
```

Extension ID:

```txt
@executioncontrolprotocol/image-sharp
```

Capability namespace:

```txt
@executioncontrolprotocol/image-sharp.inspect
@executioncontrolprotocol/image-sharp.metadata
@executioncontrolprotocol/image-sharp.stats
@executioncontrolprotocol/image-sharp.transform
@executioncontrolprotocol/image-sharp.derive
@executioncontrolprotocol/image-sharp.normalize
@executioncontrolprotocol/image-sharp.convert
@executioncontrolprotocol/image-sharp.thumbnail
@executioncontrolprotocol/image-sharp.crop
@executioncontrolprotocol/image-sharp.resize
@executioncontrolprotocol/image-sharp.composite
```

The extension should be intrinsic: bind it with `extension("@executioncontrolprotocol/image-sharp").with(...)`, then invoke capabilities from steps. That matches the current ECP model where extensions provide capabilities, workflows invoke `step(capability).with(input).as(...)`, and environments hold extension config outside portable workflow manifests.

---

# Core design principle

Use **image references**, not raw bytes, in workflow manifests.

Workflow manifests should stay portable and should not embed runtime config, secrets, or large binary payloads. ECP already treats workflows as portable execution graphs and environments as the configured execution container.

So every image input/output should be an artifact reference:

```ts
type ImageRef =
  | { kind: "artifact"; uri: string; mediaType?: string; name?: string }
  | { kind: "file"; path: string; mediaType?: string }
  | { kind: "url"; url: string; headers?: Record<string, string> }
  | { kind: "buffer"; data: Uint8Array; mediaType?: string } // runtime-only, not manifest-friendly
```

For workflows, prefer:

```json
{
  "kind": "artifact",
  "uri": "s3://bucket/images/input.jpg",
  "mediaType": "image/jpeg"
}
```

or a storage extension reference:

```json
{
  "kind": "artifact",
  "uri": "ecp://artifacts/input-image"
}
```

---

# Extension config

```ts
export const imageSharpExtension = defineExtension("@executioncontrolprotocol", "image-sharp")
  .withConfig({
    storage: {
      defaultStore: string().optional(),
      tempPrefix: string().default("tmp/image-sharp"),
      outputPrefix: string().default("artifacts/images"),
    },

    limits: {
      maxInputBytes: number().default(50 * 1024 * 1024),
      maxOutputBytes: number().default(50 * 1024 * 1024),
      maxPixels: number().default(80_000_000),
      maxWidth: number().default(16_384),
      maxHeight: number().default(16_384),
      allowSvgInput: boolean().default(true),
      allowRemoteUrls: boolean().default(false),
    },

    defaults: {
      format: string().default("webp"),
      quality: number().default(82),
      stripMetadata: boolean().default(true),
      failOn: string().default("warning"),
    },

    concurrency: {
      sharpConcurrency: number().optional(),
      queueLimit: number().optional(),
    },
  })
  .withCapabilities([
    inspectCapability,
    metadataCapability,
    statsCapability,
    transformCapability,
    deriveCapability,
    normalizeCapability,
    convertCapability,
    thumbnailCapability,
    cropCapability,
    resizeCapability,
    compositeCapability,
  ]);
```

Sharp can remove metadata by default on output, with explicit metadata control available through output options. ([sharp][2]) That maps cleanly to an ECP default of `stripMetadata: true`, with opt-in `preserveMetadata`.

---

# Capability model

## 1. `@executioncontrolprotocol/image-sharp.inspect`

Use this to make decisions before transforming.

```ts
step("@executioncontrolprotocol/image-sharp.inspect", "Inspect source image")
  .with({
    image: ref("inputImage"),
    include: ["metadata", "stats", "dominantColor", "hash"],
  })
  .as("imageInfo");
```

Output:

```ts
interface InspectImageOutput {
  image: ImageRef;
  metadata: {
    format?: string;
    width?: number;
    height?: number;
    space?: string;
    channels?: number;
    depth?: string;
    density?: number;
    hasAlpha?: boolean;
    hasProfile?: boolean;
    orientation?: number;
    pages?: number;
    pageHeight?: number;
    delay?: number[];
    sizeBytes?: number;
  };
  stats?: {
    channels: Array<{
      min: number;
      max: number;
      sum: number;
      squaresSum: number;
      mean: number;
      stdev: number;
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    }>;
    isOpaque?: boolean;
    entropy?: number;
    sharpness?: number;
    dominant?: { r: number; g: number; b: number };
  };
  derived: {
    aspectRatio?: number;
    orientation: "landscape" | "portrait" | "square" | "unknown";
    megapixels?: number;
    recommendedTransforms?: string[];
  };
}
```

Why this matters: workflow branches can use the output:

```ts
branch([
  step("@executioncontrolprotocol/image-sharp.transform", "Downsample huge image")
    .when(expr.gt("imageInfo.derived.megapixels", 24))
    .with({
      image: ref("inputImage"),
      pipeline: [
        { op: "resize", width: 4096, height: 4096, fit: "inside", withoutEnlargement: true },
      ],
      output: { format: "webp", quality: 85 },
    })
    .as("processedImage"),
]);
```

You may need to add `expr.gt`, `expr.lt`, etc., but conceptually this fits ECPâ€™s existing `branch` and `loop` workflow model.

---

## 2. `@executioncontrolprotocol/image-sharp.transform`

This is the main reusable capability. It accepts an ordered pipeline of operations.

```ts
step("@executioncontrolprotocol/image-sharp.transform", "Prepare campaign image")
  .with({
    image: ref("sourceImage"),
    pipeline: [
      { op: "rotate", auto: true },
      { op: "resize", width: 1600, height: 900, fit: "cover", position: "attention" },
      { op: "sharpen", sigma: 1.2 },
      { op: "modulate", brightness: 1.04, saturation: 1.1 },
    ],
    output: {
      format: "webp",
      quality: 84,
      artifact: {
        name: "campaign-hero.webp",
        store: "default",
      },
    },
  })
  .as("heroImage");
```

Sharpâ€™s resize API supports width/height and fit modes such as `cover`, `contain`, `fill`, and `inside`. ([sharp][3]) Composition is also pipeline-aware: Sharp applies operations such as resize, rotate, flip, flop, and extract before composition. ([sharp][4])

Output:

```ts
interface TransformImageOutput {
  image: ImageRef;
  info: {
    format: string;
    width: number;
    height: number;
    channels: number;
    sizeBytes: number;
    premultiplied?: boolean;
    cropOffsetLeft?: number;
    cropOffsetTop?: number;
    attentionX?: number;
    attentionY?: number;
    pages?: number;
    pageHeight?: number;
  };
  operations: AppliedOperationRecord[];
  source: {
    image: ImageRef;
    metadata?: ImageMetadataSummary;
  };
}
```

---

# Pipeline operation schema

I would expose Sharp through a discriminated union:

```ts
type SharpPipelineOperation =
  | ResizeOp
  | CropOp
  | ExtractOp
  | ExtendOp
  | TrimOp
  | RotateOp
  | FlipOp
  | FlopOp
  | AffineOp
  | CompositeOp
  | FlattenOp
  | EnsureAlphaOp
  | RemoveAlphaOp
  | BackgroundOp
  | BlurOp
  | SharpenOp
  | MedianOp
  | GreyscaleOp
  | NegateOp
  | NormalizeOp
  | LinearOp
  | ModulateOp
  | TintOp
  | GammaOp
  | ThresholdOp
  | BooleanOp
  | ConvolveOp
  | RecombOp
  | ColorSpaceOp
  | MetadataOp;
```

The important part: ECP users get stable declarative configs, while the extension handles Sharp-specific method calls.

---

# Operations to expose

## Geometry

```ts
type ResizeOp = {
  op: "resize";
  width?: number;
  height?: number;
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
  position?: "center" | "top" | "right top" | "right" | "right bottom" | "bottom" | "left bottom" | "left" | "left top" | "entropy" | "attention";
  background?: ColorInput;
  kernel?: "nearest" | "cubic" | "mitchell" | "lanczos2" | "lanczos3";
  withoutEnlargement?: boolean;
  withoutReduction?: boolean;
  fastShrinkOnLoad?: boolean;
};

type ExtractOp = {
  op: "extract";
  left: number;
  top: number;
  width: number;
  height: number;
};

type CropOp = {
  op: "crop";
  left?: number;
  top?: number;
  width: number;
  height: number;
  gravity?: string;
  strategy?: "entropy" | "attention";
};

type ExtendOp = {
  op: "extend";
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  background?: ColorInput;
};

type TrimOp = {
  op: "trim";
  background?: ColorInput;
  threshold?: number;
};
```

## Orientation and transforms

```ts
type RotateOp = {
  op: "rotate";
  angle?: 0 | 90 | 180 | 270 | number;
  auto?: boolean;
  background?: ColorInput;
};

type FlipOp = { op: "flip" };
type FlopOp = { op: "flop" };

type AffineOp = {
  op: "affine";
  matrix: [[number, number], [number, number]] | number[][];
  background?: ColorInput;
  idx?: number;
  idy?: number;
  odx?: number;
  ody?: number;
};
```

Sharp exposes rotation and affine transforms in its operations API. ([sharp][5])

## Composition

```ts
type CompositeOp = {
  op: "composite";
  images: Array<{
    image: ImageRef;
    left?: number;
    top?: number;
    gravity?: string;
    blend?:
      | "over"
      | "in"
      | "out"
      | "atop"
      | "dest"
      | "dest-over"
      | "dest-in"
      | "dest-out"
      | "dest-atop"
      | "xor"
      | "add"
      | "saturate"
      | "multiply"
      | "screen"
      | "overlay"
      | "darken"
      | "lighten"
      | "colour-dodge"
      | "colour-burn"
      | "hard-light"
      | "soft-light"
      | "difference"
      | "exclusion";
    opacity?: number;
    tile?: boolean;
    premultiplied?: boolean;
    density?: number;
  }>;
};
```

This is how you support watermarking, overlays, generated-image masks, frame templates, and product mockups.

## Color and tone

```ts
type ModulateOp = {
  op: "modulate";
  brightness?: number;
  saturation?: number;
  hue?: number;
  lightness?: number;
};

type TintOp = {
  op: "tint";
  color: ColorInput;
};

type GammaOp = {
  op: "gamma";
  gamma?: number;
  gammaOut?: number;
};

type NormalizeOp = {
  op: "normalize";
  lower?: number;
  upper?: number;
};

type LinearOp = {
  op: "linear";
  a?: number | number[];
  b?: number | number[];
};

type GreyscaleOp = {
  op: "greyscale";
};

type NegateOp = {
  op: "negate";
  alpha?: boolean;
};

type ThresholdOp = {
  op: "threshold";
  threshold?: number;
  greyscale?: boolean;
};
```

## Effects and filters

```ts
type BlurOp = {
  op: "blur";
  sigma?: number | boolean;
};

type SharpenOp = {
  op: "sharpen";
  sigma?: number;
  m1?: number;
  m2?: number;
  x1?: number;
  y2?: number;
  y3?: number;
};

type MedianOp = {
  op: "median";
  size?: number;
};

type ConvolveOp = {
  op: "convolve";
  width: number;
  height: number;
  kernel: number[];
  scale?: number;
  offset?: number;
};
```

## Alpha and background

```ts
type FlattenOp = {
  op: "flatten";
  background?: ColorInput;
};

type EnsureAlphaOp = {
  op: "ensureAlpha";
  alpha?: number;
};

type RemoveAlphaOp = {
  op: "removeAlpha";
};

type BackgroundOp = {
  op: "background";
  color: ColorInput;
};
```

## Output and metadata

```ts
type OutputOptions = {
  format?: "jpeg" | "png" | "webp" | "avif" | "tiff" | "gif" | "raw";
  quality?: number;
  effort?: number;
  progressive?: boolean;
  compressionLevel?: number;
  lossless?: boolean;
  nearLossless?: boolean;
  chromaSubsampling?: "4:4:4" | "4:2:0";
  palette?: boolean;
  colors?: number;
  stripMetadata?: boolean;
  preserveMetadata?: boolean;
  withMetadata?: {
    orientation?: number;
    density?: number;
    icc?: "srgb" | "p3" | string;
    exif?: Record<string, unknown>;
    xmp?: string;
  };
  artifact?: {
    store?: string;
    name?: string;
    prefix?: string;
    contentDisposition?: string;
    cacheControl?: string;
  };
};
```

Sharpâ€™s `toFile`/`toBuffer` completion info includes format, size, width, height, channels, and additional crop/attention fields when relevant. ([sharp][2]) That should be reflected directly in ECPâ€™s output schema.

---

# Atomic convenience capabilities

The pipeline is the main power tool, but these convenience capabilities make authoring easier for agents and humans.

## `resize`

```ts
step("@executioncontrolprotocol/image-sharp.resize", "Resize to social square")
  .with({
    image: ref("sourceImage"),
    width: 1080,
    height: 1080,
    fit: "cover",
    position: "attention",
    output: { format: "webp", quality: 86 },
  })
  .as("squareImage");
```

## `crop`

```ts
step("@executioncontrolprotocol/image-sharp.crop", "Crop face area")
  .with({
    image: ref("sourceImage"),
    box: { left: 240, top: 120, width: 800, height: 800 },
    output: { format: "png" },
  })
  .as("croppedImage");
```

## `thumbnail`

```ts
step("@executioncontrolprotocol/image-sharp.thumbnail", "Generate thumbnails")
  .with({
    image: ref("sourceImage"),
    sizes: [
      { name: "sm", width: 320 },
      { name: "md", width: 768 },
      { name: "lg", width: 1440 },
    ],
    fit: "inside",
    output: { format: "webp", quality: 80 },
  })
  .as("thumbnails");
```

## `derive`

Creates multiple outputs from one source in one capability.

```ts
step("@executioncontrolprotocol/image-sharp.derive", "Create responsive assets")
  .with({
    image: ref("sourceImage"),
    variants: [
      {
        name: "hero-desktop",
        pipeline: [{ op: "resize", width: 1920, height: 1080, fit: "cover", position: "attention" }],
        output: { format: "webp", quality: 84 },
      },
      {
        name: "hero-mobile",
        pipeline: [{ op: "resize", width: 1080, height: 1350, fit: "cover", position: "attention" }],
        output: { format: "webp", quality: 84 },
      },
      {
        name: "thumbnail",
        pipeline: [{ op: "resize", width: 400, height: 400, fit: "cover" }],
        output: { format: "jpeg", quality: 78 },
      },
    ],
  })
  .as("imageVariants");
```

This is especially useful for marketing automation, app upload pipelines, or generated image workflows.

---

# Decision-oriented workflow example

This is the shape Iâ€™d want for your use case: inspect first, then branch based on metadata.

```ts
const imagePrepWorkflow = workflow("Prepare uploaded image")
  .run([
    step("@executioncontrolprotocol/image-sharp.inspect", "Inspect Image")
      .with({
        image: ref("input.image"),
        include: ["metadata", "stats"],
      })
      .as("imageInfo"),

    step("@executioncontrolprotocol/image-sharp.transform", "Normalize Orientation")
      .with({
        image: ref("input.image"),
        pipeline: [
          { op: "rotate", auto: true },
          { op: "colorspace", space: "srgb" },
        ],
        output: {
          format: "png",
          stripMetadata: true,
        },
      })
      .as("normalized"),

    branch([
      step("@executioncontrolprotocol/image-sharp.transform", "Downsample Large Image")
        .when(expr.gt("imageInfo.derived.megapixels", 12))
        .with({
          image: ref("normalized.image"),
          pipeline: [
            { op: "resize", width: 3000, height: 3000, fit: "inside", withoutEnlargement: true },
          ],
          output: { format: "webp", quality: 84 },
        })
        .as("processedImage", { mode: "replace" }),

      step("@executioncontrolprotocol/image-sharp.transform", "Keep Size But Convert")
        .when(expr.lte("imageInfo.derived.megapixels", 12))
        .with({
          image: ref("normalized.image"),
          pipeline: [],
          output: { format: "webp", quality: 84 },
        })
        .as("processedImage", { mode: "replace" }),
    ]),

    step("@executioncontrolprotocol/image-sharp.derive", "Generate Delivery Variants")
      .with({
        image: ref("processedImage.image"),
        variants: [
          {
            name: "thumb",
            pipeline: [{ op: "resize", width: 320, height: 320, fit: "cover" }],
            output: { format: "webp", quality: 78 },
          },
          {
            name: "preview",
            pipeline: [{ op: "resize", width: 1200, fit: "inside" }],
            output: { format: "webp", quality: 82 },
          },
        ],
      })
      .as("variants"),
  ]);
```

---

# Mutable state pattern for image manifests

For more complex flows, especially generated images, it would be useful to mutate an `assetManifest` state object as each derivative is created.

ECP already has a `state()` helper model where `ref()` reads committed state, while `state()` passes a controlled mutable handle into a step. Store writes happen through `ctx.store`, not through arbitrary mutation.

Example:

```ts
workflow("Build image asset manifest")
  .run([
    step("@executioncontrolprotocol/image-sharp.inspect", "Inspect Original")
      .with({ image: ref("input.image") })
      .as("originalInfo"),

    step("@executioncontrolprotocol/image-sharp.derive", "Create Variants")
      .with({
        image: ref("input.image"),
        manifest: state("assetManifest"),
        variants: [
          {
            name: "card",
            pipeline: [{ op: "resize", width: 1200, height: 630, fit: "cover" }],
            output: { format: "webp", quality: 84 },
          },
          {
            name: "square",
            pipeline: [{ op: "resize", width: 1080, height: 1080, fit: "cover" }],
            output: { format: "webp", quality: 84 },
          },
        ],
      })
      .as("variantResult"),
  ]);
```

Inside `derive`, the extension can do:

```ts
await ctx.store.merge(input.manifest, {
  variants: outputs,
  source: input.image,
  generatedAt: new Date().toISOString(),
}, {
  reason: "Record generated image derivatives",
});
```

That is exactly where the state-control policy matters. The runtime can stage mutations during the capability, expose them to `policy:post`, then commit them transactionally with the step output.

---

# Policy controls

Image processing can be expensive and risky if you allow remote URLs, huge SVGs, large pixel counts, or uncontrolled output formats. Iâ€™d add a first-party image policy.

```txt
@executioncontrolprotocol/image-policy
```

Config:

```ts
interface ImagePolicyConfig {
  allowedInputKinds?: Array<"artifact" | "file" | "url" | "buffer">;
  allowedOutputFormats?: Array<"jpeg" | "png" | "webp" | "avif" | "tiff" | "gif" | "raw">;

  maxInputBytes?: number;
  maxOutputBytes?: number;
  maxPixels?: number;
  maxWidth?: number;
  maxHeight?: number;

  allowSvg?: boolean;
  allowRemoteUrls?: boolean;
  allowedUrlDomains?: string[];

  requireStripMetadata?: boolean;
  denyRawOutput?: boolean;

  maxVariantsPerStep?: number;
  maxCompositeImages?: number;
}
```

This should work alongside `@executioncontrolprotocol/state-control`, which already gives you allowed mutable paths, allowed mutation operations, mutation-size limits, and audit behavior.

---

# Extension implementation sketch

```ts
import sharp from "sharp";
import { defineExtension, capabilityFor } from "@executioncontrolprotocol/core";
import {
  TransformInput,
  TransformOutput,
  InspectInput,
  InspectOutput,
} from "./schemas";
import { readImageToBuffer, writeArtifact } from "./artifact";
import { applyOperation } from "./operations";

export const imageSharpExtension = defineExtension("@executioncontrolprotocol", "image-sharp")
  .withConfig(ImageSharpConfigSchema)
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/image-sharp", "inspect")
      .withInput(InspectInput)
      .withOutput(InspectOutput)
      .withHandler(async (input, ctx) => {
        const source = await readImageToBuffer(input.image, ctx);

        const instance = sharp(source.buffer, {
          failOn: input.failOn ?? "warning",
          limitInputPixels: input.limits?.maxPixels,
          animated: input.animated ?? true,
        });

        const metadata = await instance.metadata();
        const stats = input.include?.includes("stats")
          ? await sharp(source.buffer).stats()
          : undefined;

        return {
          image: input.image,
          metadata,
          stats,
          derived: deriveImageFacts(metadata, stats),
        };
      }),

    capabilityFor("@executioncontrolprotocol/image-sharp", "transform")
      .withInput(TransformInput)
      .withOutput(TransformOutput)
      .withHandler(async (input, ctx) => {
        const source = await readImageToBuffer(input.image, ctx);

        let instance = sharp(source.buffer, {
          failOn: input.failOn ?? "warning",
          limitInputPixels: input.limits?.maxPixels,
          animated: input.animated ?? true,
        });

        for (const op of input.pipeline ?? []) {
          instance = await applyOperation(instance, op, ctx);
        }

        instance = applyOutputOptions(instance, input.output);

        const { data, info } = await instance.toBuffer({ resolveWithObject: true });

        const image = await writeArtifact(data, {
          mediaType: mediaTypeFor(info.format),
          name: input.output?.artifact?.name,
          prefix: input.output?.artifact?.prefix,
          store: input.output?.artifact?.store,
        }, ctx);

        return {
          image,
          info,
          operations: input.pipeline ?? [],
          source: {
            image: input.image,
          },
        };
      }),
  ]);
```

Operation dispatcher:

```ts
export async function applyOperation(
  image: sharp.Sharp,
  op: SharpPipelineOperation,
  ctx: CapabilityContext
): Promise<sharp.Sharp> {
  switch (op.op) {
    case "resize":
      return image.resize(op.width, op.height, {
        fit: op.fit,
        position: op.position,
        background: op.background,
        kernel: op.kernel,
        withoutEnlargement: op.withoutEnlargement,
        withoutReduction: op.withoutReduction,
        fastShrinkOnLoad: op.fastShrinkOnLoad,
      });

    case "extract":
      return image.extract({
        left: op.left,
        top: op.top,
        width: op.width,
        height: op.height,
      });

    case "rotate":
      return op.auto
        ? image.rotate()
        : image.rotate(op.angle, { background: op.background });

    case "flip":
      return image.flip();

    case "flop":
      return image.flop();

    case "extend":
      return image.extend({
        top: op.top ?? 0,
        bottom: op.bottom ?? 0,
        left: op.left ?? 0,
        right: op.right ?? 0,
        background: op.background,
      });

    case "trim":
      return image.trim({
        background: op.background,
        threshold: op.threshold,
      });

    case "composite": {
      const overlays = await Promise.all(
        op.images.map(async overlay => ({
          input: (await readImageToBuffer(overlay.image, ctx)).buffer,
          left: overlay.left,
          top: overlay.top,
          gravity: overlay.gravity,
          blend: overlay.blend,
          tile: overlay.tile,
          premultiplied: overlay.premultiplied,
          density: overlay.density,
        }))
      );

      return image.composite(overlays);
    }

    case "blur":
      return image.blur(op.sigma);

    case "sharpen":
      return image.sharpen({
        sigma: op.sigma,
        m1: op.m1,
        m2: op.m2,
        x1: op.x1,
        y2: op.y2,
        y3: op.y3,
      });

    case "modulate":
      return image.modulate({
        brightness: op.brightness,
        saturation: op.saturation,
        hue: op.hue,
        lightness: op.lightness,
      });

    case "flatten":
      return image.flatten({ background: op.background });

    case "ensureAlpha":
      return image.ensureAlpha(op.alpha);

    case "removeAlpha":
      return image.removeAlpha();

    case "greyscale":
      return image.greyscale();

    case "normalize":
      return image.normalize({
        lower: op.lower,
        upper: op.upper,
      });

    case "gamma":
      return image.gamma(op.gamma, op.gammaOut);

    case "threshold":
      return image.threshold(op.threshold, {
        greyscale: op.greyscale,
      });

    case "affine":
      return image.affine(op.matrix, {
        background: op.background,
        idx: op.idx,
        idy: op.idy,
        odx: op.odx,
        ody: op.ody,
      });

    default:
      assertNever(op);
  }
}
```

---

# Storage and references

I would not bake S3, local files, or R2 directly into `@executioncontrolprotocol/image-sharp`. Instead, define a tiny artifact adapter interface and let `@executioncontrolprotocol/storage` or runtime config provide it.

```ts
interface ArtifactStore {
  read(ref: ImageRef, ctx: CapabilityContext): Promise<{
    buffer: Buffer;
    mediaType?: string;
    sizeBytes?: number;
    name?: string;
  }>;

  write(data: Buffer, options: {
    mediaType: string;
    name?: string;
    prefix?: string;
    store?: string;
    metadata?: Record<string, string>;
  }, ctx: CapabilityContext): Promise<ImageRef>;
}
```

Then the extension config can select the default store:

```ts
extension("@executioncontrolprotocol/image-sharp", "Sharp Image Processing").with({
  storage: {
    defaultStore: "s3-assets",
    outputPrefix: "generated/images",
  },
});
```

---

# Environment binding

```ts
const imageEnv = environment("image-processing")
  .withExtensions([
    extension("@executioncontrolprotocol/storage").with({
      stores: {
        "s3-assets": {
          type: "s3",
          bucket: env("IMAGE_BUCKET"),
          region: env("AWS_REGION"),
        },
      },
    }),

    extension("@executioncontrolprotocol/image-sharp").with({
      storage: {
        defaultStore: "s3-assets",
        outputPrefix: "images",
      },
      limits: {
        maxInputBytes: 50 * 1024 * 1024,
        maxOutputBytes: 50 * 1024 * 1024,
        maxPixels: 80_000_000,
        allowRemoteUrls: false,
      },
      defaults: {
        format: "webp",
        quality: 84,
        stripMetadata: true,
      },
    }),
  ])
  .withPolicies([
    policy("@executioncontrolprotocol/image-policy").with({
      allowedInputKinds: ["artifact", "file"],
      allowedOutputFormats: ["jpeg", "png", "webp", "avif"],
      maxPixels: 80_000_000,
      requireStripMetadata: true,
      allowRemoteUrls: false,
      denyRawOutput: true,
    }),

    policy("@executioncontrolprotocol/state-control").with({
      allowedMutablePaths: ["assetManifest", "imageQueue"],
      allowedMutationOps: ["set", "replace", "merge", "append"],
      requireReason: true,
      maxMutationPayloadKb: 512,
    }),
  ]);
```

---

# What â€œfully featuredâ€ means here

I would treat the extension as three layers:

| Layer                   | Capabilities                                          | Purpose                                    |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------ |
| **Inspection**          | `inspect`, `metadata`, `stats`                        | Read image facts before deciding.          |
| **Atomic transforms**   | `resize`, `crop`, `convert`, `composite`, `thumbnail` | Easy authoring and agent discovery.        |
| **Pipeline transforms** | `transform`, `derive`, `normalize`                    | Production-grade reusable image workflows. |

The capability search/describe system should expose all of these, since ECP environments already build descriptors and search over registered capabilities.

---

# Final recommendation

Build `@executioncontrolprotocol/image-sharp` around **one declarative `transform` pipeline** plus **human/agent-friendly convenience capabilities**. Keep images as artifact refs, inspect before transform, return rich output info, and enforce limits through `@executioncontrolprotocol/image-policy`.

That gives you:

1. Cropping, resizing, upsampling, downsampling, scaling, conversion, effects, overlays, and metadata handling.
2. Decision-making based on width, height, format, channels, alpha, pages, stats, dominant color, aspect ratio, and size.
3. Portable workflows because binary data and storage config stay out of manifests.
4. Safe execution because large files, remote URLs, raw output, metadata retention, and mutable state updates are policy-controlled.
5. A clean long-term path for generated-image workflows, responsive asset generation, visual QA, and batch processing.

[1]: https://sharp.pixelplumbing.com/?utm_source=chatgpt.com "High performance Node.js image processing | sharp"
[2]: https://sharp.pixelplumbing.com/api-output/?utm_source=chatgpt.com "Output options"
[3]: https://sharp.pixelplumbing.com/api-resize/?utm_source=chatgpt.com "Resizing images"
[4]: https://sharp.pixelplumbing.com/api-composite/?utm_source=chatgpt.com "Compositing images"
[5]: https://sharp.pixelplumbing.com/api-operation/?utm_source=chatgpt.com "Image operations"
