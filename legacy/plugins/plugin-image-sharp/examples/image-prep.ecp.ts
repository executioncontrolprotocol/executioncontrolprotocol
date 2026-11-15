import { workflow, step, extension } from "@executioncontrolprotocol/core"

/** 1x1 PNG (same bytes as image-sharp unit tests). */
const FIXTURE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

export default workflow("Image prep smoke")
  .with([
    extension("@executioncontrolprotocol/image-sharp").with({
      limits: { allowRemoteUrls: false },
      defaults: { format: "webp", quality: 84, stripMetadata: true },
    }),
  ])
  .run([
    step("@executioncontrolprotocol/image-sharp.inspect", "Inspect source")
      .with({
        image: {
          kind: "buffer",
          data: FIXTURE_PNG_BASE64,
          mediaType: "image/png",
        },
        include: ["metadata"],
      })
      .as("imageInfo"),

    step("@executioncontrolprotocol/image-sharp.resize", "Resize to thumbnail")
      .with({
        image: {
          kind: "buffer",
          data: FIXTURE_PNG_BASE64,
          mediaType: "image/png",
        },
        width: 64,
        height: 64,
        fit: "cover",
        output: { format: "webp", quality: 80 },
      })
      .as("thumb"),
  ])
