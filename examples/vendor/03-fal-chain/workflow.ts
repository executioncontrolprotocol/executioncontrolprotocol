import { workflow, step, ref } from "@executioncontrolprotocol/core"

export default workflow("FAL image chain")
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
