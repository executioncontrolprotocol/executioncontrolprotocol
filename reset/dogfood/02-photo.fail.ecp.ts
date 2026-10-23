import { workflow, step, extension, ref } from "@executioncontrolprotocol/core"

/** 1x1 PNG (same bytes as image-sharp unit tests). */
const FIXTURE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

/** Dogfood A task 2 injected failure: wrong `ref()` field (object where a string is required). */
export default workflow("dogfood-photo-fail")
  .with([
    extension("@executioncontrolprotocol/image-sharp"),
    extension("@executioncontrolprotocol/azure-blob-storage").with({
      connectionString: "UseDevelopmentStorage=true",
      defaultContainer: "artifacts",
    }),
  ])
  .run([
    step("@executioncontrolprotocol/image-sharp.resize", "Resize")
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
    step("@executioncontrolprotocol/azure-blob-storage.upload", "Upload")
      .with({
        filePath: ref("thumb"),
        contentType: "image/png",
        blobName: "product.webp",
        createReadSas: true,
      })
      .as("upload"),
  ])
