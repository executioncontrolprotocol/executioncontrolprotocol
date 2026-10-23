import {
  defineExtension,
  capabilityFor,
  globalRegistry,
  NODE_ENVIRONMENT_ID,
  toProviderChatTurns
} from "@executioncontrolprotocol/core"
import { z } from "zod"

import { modelGenerateInputSchema, modelGenerateOutputSchema } from "@executioncontrolprotocol/core/types"
import { listOllamaModels } from "./list-models.js"

export { listOllamaModels, type ListOllamaModelsOptions } from "./list-models.js"

const GenerateInput = modelGenerateInputSchema

async function ollamaChat(
  baseURL: string,
  model: string,
  prompt: string,
  system?: string,
  context?: unknown,
  requestOptions?: Record<string, unknown>,
  priorMessages?: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const messages = toProviderChatTurns({
    system,
    messages: priorMessages,
    prompt,
    context
  })
  const res = await fetch(`${baseURL.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        num_ctx: 8192,
        ...(requestOptions ?? {})
      }
    })
  })
  if (!res.ok) {
    let detail = ""
    try {
      detail = (await res.text()).slice(0, 500).trim()
    } catch {
      detail = ""
    }
    throw new Error(
      detail
        ? `Ollama API error: ${res.status} for model "${model}" (${detail})`
        : `Ollama API error: ${res.status} for model "${model}"`
    )
  }
  const data = (await res.json()) as { message: { content: string } }
  return data.message.content
}

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"

function envString(name: string): string | undefined {
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    const value = proc?.env?.[name]
    return typeof value === "string" && value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

/** @executioncontrolprotocol/ollama extension. @category Extensions */
export const ollamaExtension = defineExtension("@executioncontrolprotocol", "ollama")
  .supports(NODE_ENVIRONMENT_ID)
  .withConfig({
    baseURL: z.string().optional(),
    defaultModel: z.string().optional(),
    timeoutMs: z.number().optional()
  })
  .withMetadata({
    summary: "Local Ollama server integration for Node hosts.",
    description:
      "Connects to a locally hosted Ollama instance for chat completion and model listing. Ideal for development and air-gapped deployments."
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/ollama", "generate")
      .withInput(GenerateInput)
      .withOutput(modelGenerateOutputSchema)
      .withMetadata({
        summary: "Generate text via a local Ollama server.",
        description:
          "Runs chat completion against an Ollama instance on the configured base URL. Suited for local development and offline Node workloads. Does not accept file attachments yet. Override the model per call or set a default in extension config.",
        useCases: [
          "CLI or workflow needs a local model without cloud credentials.",
          "Local development runs chat turns against a pinned model tag."
        ],
        projections: [
          {
            summary: "Use the model text",
            description: "Take the text field as the generated assistant or step output for downstream steps."
          }
        ]
      })
      .withHandler(async (input, ctx) => {
        const parsed = input as z.infer<typeof GenerateInput>
        if (parsed.files && parsed.files.length > 0) {
          throw new Error(
            "@executioncontrolprotocol/ollama.generate does not support files yet"
          )
        }
        const cfg = (ctx as { extensionConfig?: Record<string, unknown> }).extensionConfig ?? {}
        const baseURL =
          (cfg.baseURL as string | undefined) ??
          envString("OLLAMA_BASE_URL") ??
          DEFAULT_OLLAMA_BASE_URL
        const model =
          parsed.model ?? (cfg.defaultModel as string | undefined) ?? "gemma3:1b"
        ctx.usage.increment({ modelCalls: 1 })
        const text = await ollamaChat(
          baseURL,
          model,
          parsed.prompt,
          parsed.system,
          parsed.context,
          parsed.options as Record<string, unknown> | undefined,
          parsed.messages
        )
        return { text }
      }),
    capabilityFor("@executioncontrolprotocol/ollama", "listModels")
      .withInput(z.object({ baseURL: z.string().optional() }))
      .withOutput(z.object({ models: z.array(z.string()) }))
      .withMetadata({
        summary: "List models available on the Ollama server.",
        description:
          "Returns model tags reported by the Ollama tags API. Use before generate to pick an installed model or to populate a model picker in local dev tools.",
        useCases: [
          "Settings UI shows which models are pulled locally.",
          "Script verifies a required model tag exists before a generate step."
        ],
        projections: [
          {
            summary: "Take available model tags",
            description: "Use the models array to pick a tag for generate or to confirm a required model is installed."
          }
        ]
      })
      .withHandler(async (input, ctx) => {
        const parsed = input as { baseURL?: string }
        const cfg = (ctx as { extensionConfig?: Record<string, unknown> }).extensionConfig ?? {}
        const baseURL =
          parsed.baseURL ??
          (cfg.baseURL as string | undefined) ??
          envString("OLLAMA_BASE_URL") ??
          DEFAULT_OLLAMA_BASE_URL
        const models = await listOllamaModels(baseURL)
        return { models }
      })
  ])
  .build()

/** Register @executioncontrolprotocol/ollama. */
export async function registerOllamaExtension(registry = globalRegistry): Promise<void> {
  if (!registry.getExtension("@executioncontrolprotocol/ollama")) {
    await registry.registerExtension(ollamaExtension)
  }
}

export default ollamaExtension
