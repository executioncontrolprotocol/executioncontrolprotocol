import { environment, extension, env, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import { adobeFireflyServicesExtension } from "@executioncontrolprotocol/adobe-firefly-services"

/**
 * Thin Adobe Firefly Services smoke environment.
 * Set ADOBE_CLIENT_ID / ADOBE_CLIENT_SECRET (or bind secrets) before running.
 */
export default environment(NODE_ENVIRONMENT_ID, "adobe-firefly-smoke").with([
  extension(adobeFireflyServicesExtension, "Adobe").with({
    clientId: env("ADOBE_CLIENT_ID"),
    clientSecret: env("ADOBE_CLIENT_SECRET"),
  }),
])
