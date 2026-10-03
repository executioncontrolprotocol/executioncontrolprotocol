import {
  imageSharpExtension,
  registerImageSharpExtension,
} from "@executioncontrolprotocol/image-sharp"
import { environment, extension, policy } from "@executioncontrolprotocol/node"
import { registerImagePolicy } from "@executioncontrolprotocol/policies"

await registerImageSharpExtension()
await registerImagePolicy()

export default (await environment("image-prep", "Image prep"))
  .withExtensions([
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
  .withPolicies([
    policy("@executioncontrolprotocol/image-policy", "Image policy").with({
      allowedInputKinds: ["file", "artifact", "buffer"],
      allowedOutputFormats: ["webp", "png", "jpeg"],
      maxImageRefsPerStep: 8,
      denyRawOutput: true,
    }),
  ])
