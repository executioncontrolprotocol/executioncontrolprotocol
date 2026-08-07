import { workflow, step } from "@executioncontrolprotocol/core"

export default workflow("Image prep")
  .run([
    step("@executioncontrolprotocol/image-sharp.inspect", "Inspect source")
      .with({
        image: {
          kind: "file",
          path: "examples/04-image-prep/fixture.png",
        },
        include: ["metadata", "stats"],
      })
      .as("imageInfo"),

    step("@executioncontrolprotocol/image-sharp.normalize", "Normalize orientation")
      .with({
        image: {
          kind: "file",
          path: "examples/04-image-prep/fixture.png",
        },
        output: { format: "webp", quality: 84 },
      })
      .as("normalized"),

    step("@executioncontrolprotocol/image-sharp.derive", "Create delivery variants")
      .with({
        image: { kind: "artifact", uri: "ecp://artifacts/images/normalized.webp" },
        variants: [
          {
            name: "thumb",
            pipeline: [{ op: "resize", width: 64, height: 64, fit: "cover" }],
            output: { format: "webp", quality: 78 },
          },
          {
            name: "preview",
            pipeline: [{ op: "resize", width: 320, fit: "inside" }],
            output: { format: "webp", quality: 82 },
          },
        ],
      })
      .as("variants"),
  ])
