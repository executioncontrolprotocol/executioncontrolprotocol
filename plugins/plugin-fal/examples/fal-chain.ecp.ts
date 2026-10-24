import { workflow, step, ref, extension, secrets } from "@executioncontrolprotocol/core"

export default workflow("FAL image chain")
  .with([
    extension("@executioncontrolprotocol/fal").with({
      apiKey: secrets("fal/api-key", { optional: true }),
      defaultMode: "subscribe",
    }),
  ])
  .run([
    step("@executioncontrolprotocol/fal.generate", "Generate base image")
      .with({
        endpoint: "fal-ai/flux/schnell",
        input: { prompt: "a sunset over mountains" },
      })
      .as("base"),

    step("@executioncontrolprotocol/fal.generate", "Upscale image")
      .with({
        endpoint: "fal-ai/clarity-upscaler",
        input: { image_url: ref("base.data.images.0.url") },
      })
      .as("upscaled"),
  ])
