import { workflow, step } from "@executioncontrolprotocol/core"

/**
 * Thin Adobe Firefly Services auth smoke (generate only).
 * For Azure SAS + Image5 recolor, see examples/azure-adobe-assets.
 */
export default workflow("Adobe Firefly smoke")
  .run([
    step(
      "@executioncontrolprotocol/adobe-firefly-services.firefly-generate-images-v3-async",
      "Generate images",
    )
      .with({
        body: { prompt: "a quiet desert at dusk" },
      })
      .as("generate"),
  ])
