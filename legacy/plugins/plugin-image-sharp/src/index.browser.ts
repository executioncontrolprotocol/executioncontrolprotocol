import { buildImageSharpCapabilities } from "./capability-catalog.js"
import { buildImageSharpExtension, HOST_HOP_MESSAGE } from "./shared.js"

async function hostHop(): Promise<never> {
  throw new Error(HOST_HOP_MESSAGE)
}

/** Browser catalog for `@executioncontrolprotocol/image-sharp` (no native `sharp`). @category Extensions */
export const imageSharpExtension = buildImageSharpExtension(
  buildImageSharpCapabilities({
    inspect: hostHop,
    metadata: hostHop,
    stats: hostHop,
    transform: hostHop,
    resize: hostHop,
    crop: hostHop,
    thumbnail: hostHop,
    convert: hostHop,
    composite: hostHop,
    normalize: hostHop,
    derive: hostHop,
  }),
)

export default imageSharpExtension
