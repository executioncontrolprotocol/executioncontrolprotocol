import {
  ECP_MODEL_CAPABILITY_NAME,
  modelGenerateInputSchema,
  modelGenerateOutputSchema,
  type CapabilityId,
  type ModelGenerateInput,
} from "@executioncontrolprotocol/types"
import type { CapabilityContext } from "../runtime/context.js"
import { inferResponseFormatFromFormatter } from "./format-resolve.js"

/** Default provider options for small-model harness calls (format adherence). */
export const HARNESS_MODEL_GENERATE_OPTIONS = {
  temperature: 0.1,
  top_p: 0.9,
} as const

function extractText(output: unknown): string {
  if (typeof output === "string") return output
  if (output !== null && typeof output === "object") {
    if ("text" in output) {
      const text = (output as { text: unknown }).text
      if (typeof text === "string") return text
    }
    if ("content" in output) {
      const content = (output as { content: unknown }).content
      if (typeof content === "string") return content
    }
  }
  throw new Error("Model provider returned an unsupported generate output shape")
}

/**
 * Call a harness-compatible model provider with normalized input/output.
 * @category Harness
 */
export async function callModelGenerate(
  providerCapabilityId: CapabilityId,
  input: ModelGenerateInput,
  ctx: CapabilityContext,
  outputFormat?: string
): Promise<{ text: string }> {
  const capName = providerCapabilityId.split(".").pop()
  if (capName !== ECP_MODEL_CAPABILITY_NAME) {
    throw new Error(
      `Provider ${providerCapabilityId} must use capability name "${ECP_MODEL_CAPABILITY_NAME}"`
    )
  }

  const responseFormat =
    input.responseFormat ??
    (outputFormat ? inferResponseFormatFromFormatter(outputFormat) : undefined)

  let prompt = input.prompt
  if (responseFormat === "json" && !prompt.includes("JSON")) {
    prompt = `${prompt}\n\nReply with JSON only. No markdown fences.`
  } else if (responseFormat === "toon" && !prompt.toLowerCase().includes("toon")) {
    prompt = `${prompt}\n\nReply with compact TOON only. No markdown fences.`
  } else if (responseFormat === "eql" && !prompt.toUpperCase().includes("EQL")) {
    prompt = `${prompt}\n\nReply with EQL only. No markdown fences. No ECP header line.`
  }

  const payload = modelGenerateInputSchema.parse({
    ...input,
    prompt,
    responseFormat,
    options: {
      ...HARNESS_MODEL_GENERATE_OPTIONS,
      ...(input.options ?? {}),
    },
  })

  const raw = await ctx.capabilities.call(providerCapabilityId, payload)
  const text = extractText(raw)
  return modelGenerateOutputSchema.parse({ text })
}
