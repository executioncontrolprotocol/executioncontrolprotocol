import { z } from "zod"
import { AdobeServiceError, CONFIG_INVALID } from "./errors.js"

/**
 * Plugin config: OAuth server-to-server credentials from the Adobe Developer Console, plus
 * optional endpoint overrides and poll timing.
 * @category Plugins
 */
export const adobeConfigSchema = z.object({
  clientId: z.string().min(1).describe("Adobe Developer Console client id. Also sent as the x-api-key header."),
  clientSecret: z.string().min(1).describe("Adobe Developer Console client secret."),
  scopes: z
    .string()
    .optional()
    .describe("IMS scopes, comma- or space-separated. Defaults to the Firefly Services scope set."),
  imsEndpoint: z.url().optional().describe("IMS token endpoint. Defaults to the production IMS v3 token URL."),
  baseUrl: z
    .url()
    .optional()
    .describe("Replaces each API's server URL (for a proxy or a mock). Status URLs returned by Adobe are used as-is."),
  pollIntervalMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Delay between async job status checks. Defaults to 2000."),
  pollTimeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Longest wait for an async job before the step fails. Defaults to 570000."),
})

/**
 * Resolved plugin config.
 * @category Plugins
 */
export type AdobeConfig = z.infer<typeof adobeConfigSchema>

/**
 * Parse the step's config object or throw `ECP_CONFIG_INVALID` with issue paths.
 * @category Plugins
 */
export function resolveAdobeConfig(raw: unknown): AdobeConfig {
  const parsed = adobeConfigSchema.safeParse(raw)
  if (!parsed.success) {
    throw new AdobeServiceError(
      CONFIG_INVALID,
      "The adobe-firefly-services step needs a config object with clientId and clientSecret.",
      { issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) },
    )
  }
  return parsed.data
}
