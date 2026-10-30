import {
  adobeGeneratedCapabilities,
  ADOBE_GENERATED_OPERATION_COUNT,
} from "./generated/index.js"
import { withPhotoshopDiscoveryProjections } from "./discovery-projections.js"
import { buildAdobeFireflyServicesExtension } from "./shared.js"

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
export const adobeFireflyServicesExtension = buildAdobeFireflyServicesExtension(
  withPhotoshopDiscoveryProjections([...adobeGeneratedCapabilities])
)

export { ADOBE_GENERATED_OPERATION_COUNT, adobeGeneratedCapabilities }
export {
  PHOTOSHOP_GENERATE_MANIFEST_ID,
  withPhotoshopDiscoveryProjections,
} from "./discovery-projections.js"
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
export {
  assembleAdobeOperationInput,
} from "./runtime/invoke.js"
export type {
  AdobeAsyncMode,
  AdobeMaterializeMode,
  AdobeOperationInput,
  AdobeParameterMap,
  AssembledAdobeRequest,
} from "./runtime/invoke.js"

export default adobeFireflyServicesExtension
