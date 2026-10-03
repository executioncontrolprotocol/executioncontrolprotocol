import {
  catalogExtension,
  globalRegistry,
  type Registry,
} from "@executioncontrolprotocol/core"
import { buildImageSharpCapabilities } from "./capability-catalog.js"
import { buildImageSharpExtension, EXT_ID, HOST_HOP_MESSAGE } from "./shared.js"

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

catalogExtension(imageSharpExtension)

/** Register `@executioncontrolprotocol/image-sharp` (catalog only in the browser). */
export async function registerImageSharpExtension(registry: Registry = globalRegistry): Promise<void> {
  if (!registry.getExtension(EXT_ID)) {
    await registry.registerExtension(imageSharpExtension)
  }
}

export default imageSharpExtension
