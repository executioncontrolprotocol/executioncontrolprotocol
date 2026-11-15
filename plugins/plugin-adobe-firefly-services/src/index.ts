import { definePlugin } from "@executioncontrolprotocol/plugin-sdk"
import { adobeConfigSchema } from "./config.js"
import { generatedCapabilities } from "./generated/index.js"

export { adobeConfigSchema } from "./config.js"
export type { AdobeConfig } from "./config.js"
export { GENERATED_CAPABILITY_COUNT, generatedCapabilities } from "./generated/index.js"

/**
 * Plugin id. Capability ids are `${PLUGIN_ID}.<family>-<operation>`.
 * @category Plugins
 */
export const PLUGIN_ID = "@executioncontrolprotocol/adobe-firefly-services"

/**
 * Adobe Firefly Services plugin. Capabilities are generated from the vendored OpenAPI specs;
 * handler code loads on first call.
 * @category Plugins
 */
export default definePlugin({
  id: PLUGIN_ID,
  summary: "Adobe Firefly Services: Firefly image and video generation and Photoshop document edits.",
  description:
    "One capability per Firefly Services API operation, generated from Adobe's OpenAPI specs: Firefly image generation, expand, fill, composites, upscaling and video, and Photoshop document edits, actions, UXP scripts, artboards and layer manifests. The config object holds OAuth server-to-server credentials (client id and secret as secret references). Async jobs are polled inside the step, which returns the job result. Request fields are top-level parameters; an optional body carries the rest of the JSON document. Files move by URL: pass presigned storage URLs as sources and output destinations.",
  config: adobeConfigSchema,
  capabilities: {
    ...generatedCapabilities,
  },
})
