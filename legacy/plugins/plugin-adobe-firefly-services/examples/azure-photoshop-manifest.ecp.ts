import { workflow, step, ref, extension, secrets } from "@executioncontrolprotocol/core"

/**
 * Minimal 1x1 RGB PSD (`sample.psd`) — enough for upload + generate-manifest smoke.
 * Replace with a real layered PSD via contentBase64 / sourceUrl / filePath for live runs.
 */
const FIXTURE_PSD_BASE64 =
  "OEJQUwABAAAAAAAAAAMAAAABAAAAAQAIAAMAAAAAAAAAAAAAAAAAAP8AAA=="

/**
 * Upload a PSD to Azure, mint a write SAS for the manifest JSON, then call Photoshop
 * generate-manifest. The capability polls internally and returns the PSD manifest JSON
 * (layer tree) as step output.
 */
export default workflow("Azure Blob + Photoshop generate-manifest")
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
    step("@executioncontrolprotocol/azure-blob-storage.upload", "Upload PSD")
      .with({
        contentBase64: FIXTURE_PSD_BASE64,
        contentType: "image/vnd.adobe.photoshop",
        blobName: "sample.psd",
        createReadSas: true,
      })
      .as("upload"),

    step("@executioncontrolprotocol/azure-blob-storage.create-sas-url", "Write SAS for manifest")
      .with({
        blobName: "sample-manifest.json",
        permissions: ["r", "c", "w"],
      })
      .as("dest"),

    step(
      "@executioncontrolprotocol/adobe-firefly-services.photoshop-generate-manifest",
      "Generate PSD manifest",
    )
      .with({
        image: { source: { url: ref("upload.sasUrl") } },
        outputs: [
          {
            mediaType: "application/json",
            destination: {
              storageType: "azure",
              url: ref("dest.sasUrl"),
            },
          },
        ],
      })
      .as("manifest"),
  ])
