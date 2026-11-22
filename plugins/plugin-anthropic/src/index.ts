import { capability, definePlugin } from "@executioncontrolprotocol/plugin-sdk"
import { anthropicConfigSchema, generateAcceptsSchema, generateReturnsSchema } from "./schemas.js"

export {
  ANTHROPIC_DEFAULT_MODEL,
  anthropicConfigSchema,
  generateAcceptsSchema,
  generateReturnsSchema,
} from "./schemas.js"
export type { AnthropicConfig, GenerateInput, GenerateOutput } from "./schemas.js"

/**
 * Generate capability definition (for handler typing).
 * @category Plugins
 */
export const generate = capability({
  summary: "Generate text with a Claude model.",
  description:
    "Sends one user prompt, with an optional system prompt and optional images (FileRefs in JPEG, PNG, GIF or WebP, up to 5 MB each, read by the host), to the Anthropic Messages API using the model from the config object, and returns the reply text with token usage. Provider failures (bad key, rate limit, overload) fail the step with ECP_PROVIDER_ERROR and the HTTP status in details.",
  useCases: [
    "Draft, rewrite, summarise or translate text from a prompt",
    "Turn upstream step output into a short caption, title or brief",
    "Review or describe rendered images, such as checking a layout rendition against criteria",
  ],
  projections: [
    "Take `text` for the reply; `usage` reports input and output tokens for cost tracking",
  ],
  accepts: generateAcceptsSchema,
  returns: generateReturnsSchema,
  timeoutMs: 120_000,
  handler: () => import("./capabilities/generate.js"),
})

/**
 * Anthropic plugin. Claude text generation through the Messages API.
 * @category Plugins
 */
export default definePlugin({
  id: "@executioncontrolprotocol/anthropic",
  summary: "Claude models from Anthropic.",
  description:
    "Text generation with Claude through the Anthropic Messages API. The config object holds the API key (as a secret reference), the model and an optional base URL for proxies.",
  config: anthropicConfigSchema,
  capabilities: {
    generate,
  },
})
