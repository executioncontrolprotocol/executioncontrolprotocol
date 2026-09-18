import {
  catalogExtension,
  capabilityFor,
  defineExtension,
  globalRegistry,
  BROWSER_RUNTIME_ID,
  NODE_RUNTIME_ID,
  toProviderChatTurns,
  type FileCapabilityContext,
  type Registry,
} from "@executioncontrolprotocol/core"
import {
  modelGenerateInputSchema,
  modelGenerateOutputSchema,
} from "@executioncontrolprotocol/types"
import { z } from "zod"
import {
  buildAnthropicUserContent,
  resolveAnthropicModel,
  resolveAnthropicSamplingOptions,
  ANTHROPIC_DEFAULT_MODEL,
} from "./messages.js"
import { resolveAnthropicApiKey } from "./resolve-api-key.js"

export {
  ANTHROPIC_GENERATE_DOCUMENT_MEDIA_TYPES,
  ANTHROPIC_GENERATE_IMAGE_MEDIA_TYPES,
  ANTHROPIC_GENERATE_MEDIA_TYPES,
  isAnthropicDocumentMediaType,
  isAnthropicGenerateMediaType,
  isAnthropicImageMediaType,
} from "./media-types.js"
export {
  ANTHROPIC_DEFAULT_MAX_TOKENS,
  ANTHROPIC_DEFAULT_MODEL,
  buildAnthropicUserContent,
  resolveAnthropicModel,
  resolveAnthropicSamplingOptions,
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
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
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
  .withSupportedRuntimes([NODE_RUNTIME_ID, BROWSER_RUNTIME_ID])
  .withConfig({
    apiKey: z.string().optional(),
    defaultModel: z.string().optional(),
  })
  .withMetadata({
    summary: "Anthropic Messages API for browser and Node hosts.",
    description:
      "Calls the Anthropic Messages API for multimodal chat completion and harness evaluation. Supports images and documents on the final user turn when files are supplied.",
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
          "Browser or server harness needs long-context chat with document attachments.",
        ],
        samplePrompts: [
          "Describe this image and answer the user's question.",
          "Generate a reply using Claude with the attached PDF.",
        ],
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
          context: input.context,
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
          messages,
        })
        return { text }
      }),
    capabilityFor("@executioncontrolprotocol/anthropic", "evaluate")
      .withExecution("local")
      .withInput(
        z.object({
          artifact: z.unknown(),
          criteria: z.unknown().optional(),
          goal: z.string().optional(),
          classifiedIntent: z.string().optional(),
          model: z.string().optional(),
        })
      )
      .withOutput(z.object({ approved: z.boolean(), feedback: z.string().optional() }))
      .withMetadata({
        summary: "Judge harness outputs with an Anthropic model.",
        description:
          "Scores harness artifacts against a goal, rubric, and optional classified intent. Returns approved and feedback. Skips when no API key is configured. Used by harness eval gates, not end-user chat.",
        useCases: [
          "Harness matrix uses a cloud judge with intent-aware rubrics.",
          "Eval approves FAQ answers separately from workflow patch outputs.",
        ],
        samplePrompts: [
          "Evaluate whether this harness artifact passes the rubric.",
          "Judge the classified intent output for this eval case.",
        ],
      })
      .withHandler(async (input, ctx) => {
        const cfg = (ctx as { extensionConfig?: Record<string, unknown> }).extensionConfig ?? {}
        const apiKey = resolveAnthropicApiKey(cfg)
        if (!apiKey) return { approved: true, feedback: "skipped (no API key)" }
        const row = input as {
          artifact: unknown
          criteria?: unknown
          goal?: string
          classifiedIntent?: string
          model?: string
        }
        const prompt = [
          "You are an eval judge for ECP harness outputs.",
          'Reply with JSON only: {"approved":true,"feedback":"ok"} or {"approved":false,"feedback":"reason"}.',
          `Goal: ${row.goal ?? "quality check"}`,
          row.classifiedIntent ? `Classified intent: ${row.classifiedIntent}` : "",
          row.criteria ? `Rubric: ${JSON.stringify(row.criteria)}` : "",
          `Artifact: ${JSON.stringify(row.artifact)}`,
        ]
          .filter((line) => line.length > 0)
          .join("\n")
        ctx.usage.increment({ modelCalls: 1 })
        const content = await anthropicMessages(apiKey, {
          model:
            row.model ??
            (cfg.defaultModel as string | undefined) ??
            ANTHROPIC_DEFAULT_MODEL,
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        })
        try {
          return JSON.parse(content) as { approved: boolean; feedback?: string }
        } catch {
          return { approved: true, feedback: content }
        }
      }),
  ])
  .build()

catalogExtension(anthropicExtension)

/** Register Anthropic extension. @category Extensions */
export async function registerAnthropicExtension(
  registry: Registry = globalRegistry
): Promise<void> {
  if (!registry.getExtension("@executioncontrolprotocol/anthropic")) {
    await registry.registerExtension(anthropicExtension)
  }
}

export default anthropicExtension
