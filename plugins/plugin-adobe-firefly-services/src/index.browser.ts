import {
  adobeGeneratedCapabilities,
  ADOBE_GENERATED_OPERATION_COUNT,
} from "./generated/index.browser.js"
import { withPhotoshopDiscoveryProjections } from "./discovery-projections.js"
import { buildAdobeFireflyServicesExtension } from "./shared.js"

/**
 * Browser catalog for `@executioncontrolprotocol/adobe-firefly-services`.
 * Host-hop stubs only — IMS and Adobe HTTP stay on the Node host.
 *
 * @category Extensions
 */
export const adobeFireflyServicesExtension = buildAdobeFireflyServicesExtension(
  withPhotoshopDiscoveryProjections([...adobeGeneratedCapabilities])
)

export { ADOBE_GENERATED_OPERATION_COUNT, adobeGeneratedCapabilities }
export {
  PHOTOSHOP_GENERATE_MANIFEST_ID,
  withPhotoshopDiscoveryProjections,
} from "./discovery-projections.js"
export { EXT_ID, HOST_HOP_MESSAGE, buildAdobeFireflyServicesExtension } from "./shared.js"

export default adobeFireflyServicesExtension
