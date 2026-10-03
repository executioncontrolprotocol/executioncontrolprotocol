import "@executioncontrolprotocol/adobe-firefly-services"
import { environment, extension, env } from "@executioncontrolprotocol/node"
import { registerAdobeFireflyServicesExtension } from "@executioncontrolprotocol/adobe-firefly-services"

registerAdobeFireflyServicesExtension()

/**
 * Thin Adobe Firefly Services smoke environment.
 * Set ADOBE_CLIENT_ID / ADOBE_CLIENT_SECRET (or bind secrets) before running.
 */
export default environment("adobe-firefly-smoke", "Adobe Firefly Services smoke")
  .withExtensions([
    extension("@executioncontrolprotocol/adobe-firefly-services", "Adobe").with({
      clientId: env("ADOBE_CLIENT_ID"),
      clientSecret: env("ADOBE_CLIENT_SECRET"),
    }),
  ])
