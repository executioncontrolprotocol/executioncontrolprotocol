import {
  imageSharpExtension,
  registerImageSharpExtension,
} from "@executioncontrolprotocol/image-sharp"
import { environment, extension } from "@executioncontrolprotocol/node"

await registerImageSharpExtension()

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
