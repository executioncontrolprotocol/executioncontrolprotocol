import { workflow, step, extension, policy } from "@executioncontrolprotocol/core"

/** 1x1 PNG (same bytes as image-sharp unit tests). */
const FIXTURE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

/** Dogfood A task 2: resize, then upload with approval (fixed refs). */
export default workflow("dogfood-photo")
  .with([
    extension("@executioncontrolprotocol/image-sharp"),
    extension("@executioncontrolprotocol/azure-blob-storage").with({
      connectionString: "UseDevelopmentStorage=true",
      defaultContainer: "artifacts",
    }),
    policy("@executioncontrolprotocol/approval").with({
      requireApprovalFor: ["@executioncontrolprotocol/azure-blob-storage.upload"],
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
        contentBase64: FIXTURE_PNG_BASE64,
        contentType: "image/png",
        blobName: "product.webp",
        createReadSas: true,
      })
      .as("upload"),
  ])
