import { imageSharpExtension } from "@executioncontrolprotocol/image-sharp"
import { environment, extension, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"

export default environment(NODE_ENVIRONMENT_ID, "image-prep").with([
  extension(imageSharpExtension, "Sharp").with({
    limits: {
      allowRemoteUrls: false,
    },
    defaults: {
      format: "webp",
      quality: 84,
      stripMetadata: true,
    },
  }),
])
