import {
  capabilityFor,
  defineExtension,
  BROWSER_ENVIRONMENT_ID,
  NODE_ENVIRONMENT_ID,
  toProviderChatTurns,
  type FileCapabilityContext
} from "@executioncontrolprotocol/core"
import {
  modelGenerateInputSchema,
  modelGenerateOutputSchema
} from "@executioncontrolprotocol/core/types"
import { z } from "zod"
import {
  buildAnthropicUserContent,
  resolveAnthropicModel,
  resolveAnthropicSamplingOptions
} from "./messages.js"
import { resolveAnthropicApiKey } from "./resolve-api-key.js"

export {
  ANTHROPIC_GENERATE_DOCUMENT_MEDIA_TYPES,
  ANTHROPIC_GENERATE_IMAGE_MEDIA_TYPES,
  ANTHROPIC_GENERATE_MEDIA_TYPES,
  isAnthropicDocumentMediaType,
  isAnthropicGenerateMediaType,
  isAnthropicImageMediaType
} from "./media-types.js"
export {
  ANTHROPIC_DEFAULT_MAX_TOKENS,
  ANTHROPIC_DEFAULT_MODEL,
  buildAnthropicUserContent,
  resolveAnthropicModel,
  resolveAnthropicSamplingOptions
} from "./messages.js"
export { resolveAnthropicApiKey } from "./resolve-api-key.js"

async function anthropicMessages(
  apiKey: string,
  body: Record<string, unknown>
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    let detail = ""
    try {
      detail = (await res.text()).slice(0, 500).trim()
    } catch {
      detail = ""
    }
    throw new Error(
      detail ? `Anthropic API error: ${res.status} (${detail})` : `Anthropic API error: ${res.status}`
    )
  }
  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>
  }
  return data.content.find((c) => c.type === "text")?.text ?? ""
}

/** Anthropic model provider. @category Extensions */
export const anthropicExtension = defineExtension("@executioncontrolprotocol", "anthropic")
  .supports(NODE_ENVIRONMENT_ID).supports(BROWSER_ENVIRONMENT_ID)
  .withConfig({
    apiKey: z.string().optional(),
    defaultModel: z.string().optional()
  })
  .withMetadata({
    summary: "Anthropic Messages API for browser and Node hosts.",
    description:
      "Calls the Anthropic Messages API for multimodal chat completion. Supports images and documents on the final user turn when files are supplied."
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/anthropic", "generate")
      .withExecution("local")
      .withInput(modelGenerateInputSchema)
      .withOutput(modelGenerateOutputSchema)
      .withMetadata({
        summary: "Generate text with multimodal Anthropic Messages.",
        description:
          "Runs chat completion against the Anthropic Messages API. Accepts images and documents on the final user turn in browser and Node hosts. Requires a configured API key. Supports system prompts, prior turns, and sampling options.",
        useCases: [
          "Workflow step analyzes an uploaded image alongside a user question.",
          "Browser or server workflow needs long-context chat with document attachments."
        ],
        projections: [
          {
            summary: "Use the model text",
            description: "Take the text field as the generated assistant or step output for downstream steps."
          }
        ]
      })
      .withHandler(async (raw, ctx) => {
        const input = modelGenerateInputSchema.parse(raw)
        const cfg = (ctx as { extensionConfig?: Record<string, unknown> }).extensionConfig ?? {}
        const apiKey = resolveAnthropicApiKey(cfg)
        if (!apiKey) throw new Error("Anthropic API key required")
        const model = resolveAnthropicModel(input, cfg)
        const sampling = resolveAnthropicSamplingOptions(
          input.options as Record<string, unknown> | undefined
        )
        const turns = toProviderChatTurns({
          system: input.system,
          messages: input.messages,
          prompt: input.prompt,
          context: input.context
        })
        const systemParts = turns
          .filter((turn) => turn.role === "system")
          .map((turn) => turn.content)
        const priorAndCurrent = turns.filter((turn) => turn.role !== "system")
        const messages: Array<{ role: "user" | "assistant"; content: unknown }> = []
        for (let i = 0; i < priorAndCurrent.length; i++) {
          const turn = priorAndCurrent[i]!
          const isLast = i === priorAndCurrent.length - 1
          if (turn.role !== "user" && turn.role !== "assistant") {
            continue
          }
          if (isLast && turn.role === "user") {
            const content = await buildAnthropicUserContent(
              turn.content,
              input.files,
              ctx as FileCapabilityContext
            )
            messages.push({ role: "user", content })
          } else {
            messages.push({ role: turn.role, content: turn.content })
          }
        }
        ctx.usage.increment({ modelCalls: 1 })
        const text = await anthropicMessages(apiKey, {
          model,
          ...sampling,
          ...(systemParts.length > 0 ? { system: systemParts.join("\n\n") } : {}),
          messages
        })
        return { text }
      })
  ])
  .build()

export default anthropicExtension
