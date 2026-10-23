import { workflow, step, extension, secrets } from "@executioncontrolprotocol/core"

/**
 * Thin Adobe Firefly Services auth smoke (generate only).
 * For Azure SAS + Image5 recolor, see azure-adobe-assets.ecp.ts.
 */
export default workflow("Adobe Firefly smoke")
  .with([
    extension("@executioncontrolprotocol/adobe-firefly-services").with({
      clientId: secrets("adobe-firefly-services/client-id"),
      clientSecret: secrets("adobe-firefly-services/client-secret"),
    }),
  ])
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
