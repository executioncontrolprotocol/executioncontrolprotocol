import {
  globalRegistry,
  catalogExtension,
  type Registry,
} from "@executioncontrolprotocol/core"
import {
  adobeGeneratedCapabilities,
  ADOBE_GENERATED_OPERATION_COUNT,
} from "./generated/index.js"
import { buildAdobeFireflyServicesExtension, EXT_ID } from "./shared.js"

/**
 * `@executioncontrolprotocol/adobe-firefly-services` — Adobe Firefly Services extension.
 *
 * One capability per OpenAPI operation across Firefly Services families
 * (`firefly`, `photoshop` v2, `express`, `indesign`, `substance3d`, `illustrator`,
 * `creative-production`, `audio-video`). Capability ids are family-prefixed kebab, e.g.
 * `@executioncontrolprotocol/adobe-firefly-services.firefly-generate-images-v5-async`.
 *
 * Auth uses OAuth Server-to-Server (`client_credentials`). Bind secrets via
 * `secrets("adobe-firefly-services/client-id")` /
 * `secrets("adobe-firefly-services/client-secret")` or `env(...)`.
 *
 * @category Extensions
 */
export const adobeFireflyServicesExtension = buildAdobeFireflyServicesExtension([
  ...adobeGeneratedCapabilities,
])

catalogExtension(adobeFireflyServicesExtension)

/**
 * Register `@executioncontrolprotocol/adobe-firefly-services` on a registry.
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
export {
  createImsTokenProvider,
  DEFAULT_FIREFLY_SCOPES,
  DEFAULT_IMS_TOKEN_URL,
} from "./auth/ims.js"
export type { AdobeImsConfig, AdobeAccessToken } from "./auth/ims.js"
export { AdobeHttpError, buildUrl, createAdobeHttpClient } from "./http/client.js"
export type { AdobeHttpClient, AdobeRequestOptions } from "./http/client.js"
export { extractAdobeStatusUrl, pollAdobeJob } from "./http/async-job.js"
export type { PollAdobeJobOptions } from "./http/async-job.js"
export {
  collectManifestDestinationUrls,
  extractEmbeddedManifestJson,
  materializePhotoshopManifest,
  photoshopManifestDocumentSchema,
  photoshopManifestLayerSchema,
} from "./runtime/photoshop-manifest.js"
export type { AdobeAsyncMode, AdobeMaterializeMode, AdobeOperationInput } from "./runtime/invoke.js"

export default adobeFireflyServicesExtension
