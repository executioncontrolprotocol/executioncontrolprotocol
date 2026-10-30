import { workflow, step, ref, extension, secrets } from "@executioncontrolprotocol/core"

/**
 * 1x1 PNG (red pixel) — tiny fixture for upload → Image5 referenceBlobs.
 * Replace with a real photo via contentBase64 / sourceUrl / filePath for live runs.
 */
const FIXTURE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

/**
 * Upload a reference image to Azure, then instruct-edit color with Firefly Image5.
 */
export default workflow("Azure Blob + Firefly Image5 recolor")
  .with([
    extension("@executioncontrolprotocol/azure-blob-storage").with({
      connectionString: secrets("azure-blob-storage/connection-string"),
      defaultContainer: "artifacts",
      defaultSasExpiresInSeconds: 3600,
    }),
    extension("@executioncontrolprotocol/adobe-firefly-services").with({
      clientId: secrets("adobe-firefly-services/client-id"),
      clientSecret: secrets("adobe-firefly-services/client-secret"),
    }),
  ])
  .run([
    step("@executioncontrolprotocol/azure-blob-storage.upload", "Upload reference")
      .with({
        contentBase64: FIXTURE_PNG_BASE64,
        contentType: "image/png",
        blobName: "reference-recolor.png",
        createReadSas: true,
      })
      .as("upload"),

    step(
      "@executioncontrolprotocol/adobe-firefly-services.firefly-generate-images-v5-async",
      "Image5 recolor",
    )
      .with({
        "x-model-version": "image5",
        prompt:
          "Change the color palette to cool teal and deep navy; keep composition and subject",
        resolutionLevel: "2.4MP",
        modelId: "firefly_image",
        numVariations: 1,
        referenceBlobs: [
          {
            source: { url: ref("upload.sasUrl") },
            usage: "general",
          },
        ],
      })
      .as("recolor"),
  ])
