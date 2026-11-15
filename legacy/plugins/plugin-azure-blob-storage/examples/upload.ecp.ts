import { workflow, step, extension, secrets } from "@executioncontrolprotocol/core"

/** 1x1 PNG fixture for an offline-shaped upload step. Live runs need Azure credentials. */
const FIXTURE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

export default workflow("Azure Blob upload")
  .with([
    extension("@executioncontrolprotocol/azure-blob-storage").with({
      connectionString: secrets("azure-blob-storage/connection-string"),
      defaultContainer: "artifacts",
      defaultSasExpiresInSeconds: 3600,
    }),
  ])
  .run([
    step("@executioncontrolprotocol/azure-blob-storage.upload", "Upload reference")
      .with({
        contentBase64: FIXTURE_PNG_BASE64,
        contentType: "image/png",
        blobName: "reference.png",
        createReadSas: true,
      })
      .as("upload"),
  ])
