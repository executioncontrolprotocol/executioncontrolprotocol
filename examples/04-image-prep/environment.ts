import "@executioncontrolprotocol/extension-image-sharp"
import { environment, extension, policy } from "@executioncontrolprotocol/node"
import { registerImageSharpExtension } from "@executioncontrolprotocol/extension-image-sharp"
import { registerImagePolicy } from "@executioncontrolprotocol/policies"

registerImageSharpExtension()
registerImagePolicy()

export default environment("image-prep", "Image prep")
  .withExtensions([
    extension("@executioncontrolprotocol/image-sharp", "Sharp").with({
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
  .withPolicies([
    policy("@executioncontrolprotocol/image-policy", "Image policy").with({
      allowedInputKinds: ["file", "artifact", "buffer"],
      allowedOutputFormats: ["webp", "png", "jpeg"],
      maxImageRefsPerStep: 8,
      denyRawOutput: true,
    }),
  ])
