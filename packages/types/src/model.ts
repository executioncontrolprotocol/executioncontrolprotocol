import { z } from "zod"
import type { GenerateCapabilityInput, GenerateCapabilityOutput } from "./capabilities.js"
import { fileRefSchema } from "./file-ref.js"

/** Interface tag for harness-compatible model providers. @category Harness */
export const ECP_MODEL_GENERATE_INTERFACE = "@executioncontrolprotocol/model.generate" as const

/** Reserved capability name for model providers used by harnesses. @category Harness */
export const ECP_MODEL_CAPABILITY_NAME = "generate" as const

/** Response format hint for model generation. @category Harness */
export const ECP_MODEL_RESPONSE_FORMATS = {
  TEXT: "text",
  JSON: "json",
  TOON: "toon",
} as const

/** Model response format union. @category Harness */
export type EcpModelResponseFormat =
  (typeof ECP_MODEL_RESPONSE_FORMATS)[keyof typeof ECP_MODEL_RESPONSE_FORMATS]

/** Prior conversation turn for multi-turn generate. @category Harness */
export const modelGenerateMessageSchema = z.object({
  /** Turn role (system stays on the top-level system field). */
  role: z.enum(["user", "assistant"]),
  /** Turn text content. */
  content: z.string(),
})

/** Normalized model generate input. @category Harness */
export const modelGenerateInputSchema = z.object({
  /** Current user/model prompt body (always the latest user turn). */
  prompt: z.string(),
  /** System instruction. */
  system: z.string().optional(),
  /** Model override. */
  model: z.string().optional(),
  /** Optional provider context blob. */
  context: z.unknown().optional(),
  /** Output format hint for providers without native support. */
  responseFormat: z.enum(["text", "json", "toon", "eql"]).optional(),
  /** Provider-specific options (e.g. temperature, top_p for Ollama). */
  options: z.record(z.string(), z.unknown()).optional(),
  /**
   * Optional portable file refs for multimodal providers.
   * Providers that do not support files must reject a non-empty list.
   * Files attach to the current {@link modelGenerateInputSchema} prompt turn.
   */
  files: z.array(fileRefSchema()).optional(),
  /**
   * Prior conversation turns only (user/assistant). Omit or empty for single-shot.
   * Do not include system here — use {@link modelGenerateInputSchema}'s system field.
   */
  messages: z.array(modelGenerateMessageSchema).optional(),
})

/** Normalized model generate input type. @category Harness */
export type ModelGenerateInput = GenerateCapabilityInput &
  z.infer<typeof modelGenerateInputSchema>

/** Normalized model generate output. @category Harness */
export const modelGenerateOutputSchema = z.object({
  /** Generated text content. */
  text: z.string(),
})

/** Normalized model generate output type. @category Harness */
export type ModelGenerateOutput = GenerateCapabilityOutput &
  z.infer<typeof modelGenerateOutputSchema>
