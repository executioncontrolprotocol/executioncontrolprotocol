import { z } from "zod"

/**
 * Model used when the config object doesn't name one.
 * @category Plugins
 */
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-5"

/**
 * Plugin config: API key, model and an optional API base URL.
 * @category Plugins
 */
export const anthropicConfigSchema = z.object({
  apiKey: z.string(),
  model: z.string().default(ANTHROPIC_DEFAULT_MODEL),
  baseUrl: z.string().url().optional(),
})

/**
 * Parsed plugin config, with the default model applied.
 * @category Plugins
 */
export type AnthropicConfig = z.infer<typeof anthropicConfigSchema>

/**
 * Input of the `generate` capability.
 * @category Plugins
 */
export const generateAcceptsSchema = z.object({
  prompt: z.string(),
  system: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
})

/**
 * Output of the `generate` capability.
 * @category Plugins
 */
export const generateReturnsSchema = z.object({
  text: z.string(),
  usage: z.object({
    inputTokens: z.number().int(),
    outputTokens: z.number().int(),
  }),
})

/**
 * Typed input of the `generate` capability.
 * @category Plugins
 */
export type GenerateInput = z.infer<typeof generateAcceptsSchema>

/**
 * Typed output of the `generate` capability.
 * @category Plugins
 */
export type GenerateOutput = z.infer<typeof generateReturnsSchema>
