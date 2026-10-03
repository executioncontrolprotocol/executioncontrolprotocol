import {
  catalogExtension,
  globalRegistry,
  type Registry,
} from "@executioncontrolprotocol/core"
import {
  adobeGeneratedCapabilities,
  ADOBE_GENERATED_OPERATION_COUNT,
} from "./generated/index.browser.js"
import { buildAdobeFireflyServicesExtension, EXT_ID } from "./shared.js"

/**
 * Browser catalog for `@executioncontrolprotocol/adobe-firefly-services`.
 * Host-hop stubs only — IMS and Adobe HTTP stay on the Node graph / `ecp up`.
 *
 * @category Extensions
 */
export const adobeFireflyServicesExtension = buildAdobeFireflyServicesExtension([
  ...adobeGeneratedCapabilities,
])

catalogExtension(adobeFireflyServicesExtension)

/**
 * Register `@executioncontrolprotocol/adobe-firefly-services` on a registry (browser catalog).
 *
 * @category Extensions
 */
export async function registerAdobeFireflyServicesExtension(
  registry: Registry = globalRegistry,
): Promise<void> {
  if (!registry.getExtension(EXT_ID)) {
    await registry.registerExtension(adobeFireflyServicesExtension)
  }
}

export { ADOBE_GENERATED_OPERATION_COUNT, adobeGeneratedCapabilities }
export { EXT_ID, HOST_HOP_MESSAGE, buildAdobeFireflyServicesExtension } from "./shared.js"

export default adobeFireflyServicesExtension
