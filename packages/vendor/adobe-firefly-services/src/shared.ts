import {
  defineExtension,
  NODE_RUNTIME_ID,
  type CapabilityDefinition,
  type ExtensionDefinition,
} from "@executioncontrolprotocol/core"
import { z } from "zod"

/** Extension id. @category Adobe */
export const EXT_ID = "@executioncontrolprotocol/adobe-firefly-services"

/** Thrown if a host Adobe handler is invoked in the browser catalog (dispatch should hop first). @category Adobe */
export const HOST_HOP_MESSAGE =
  "Capability requires a local host. Start `ecp up --env …`."

/**
 * Build the Adobe Firefly Services extension from a capability list.
 * @category Adobe
 */
export function buildAdobeFireflyServicesExtension(
  capabilities: CapabilityDefinition[],
): ExtensionDefinition {
  return defineExtension("@executioncontrolprotocol", "adobe-firefly-services")
    .withSupportedRuntimes([NODE_RUNTIME_ID])
    .withMetadata({
      summary: "Call Adobe Firefly Services APIs across creative product families",
      description:
        "Generated capabilities for Adobe Firefly, Photoshop, Express, InDesign, Illustrator, Substance 3D, Creative Production, and Audio Video APIs. Uses OAuth server-to-server credentials and polls async jobs where required.",
      useCases: [
        "Generate or edit creative assets with Adobe cloud APIs",
        "Automate Photoshop, Express, or Firefly operations from workflows",
      ],
      samplePrompts: [
        "Generate images with Adobe Firefly",
        "Run a Photoshop API job on this document",
      ],
    })
    .withConfig({
      /** Adobe Developer Console client id (x-api-key). */
      clientId: z.string().min(1),
      /** Adobe Developer Console client secret. */
      clientSecret: z.string().min(1),
      /** IMS scopes (comma- or space-separated). */
      scopes: z.string().optional(),
      /** Override IMS token URL. */
      imsEndpoint: z.string().optional(),
    })
    .withCapabilities(capabilities)
    .build()
}
