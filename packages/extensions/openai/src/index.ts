import {
  defineExtension,
  capabilityFor,
  globalRegistry,
  catalogExtension,
  toProviderChatTurns,
  type Registry,
  NODE_RUNTIME_ID,
} from "@executioncontrolprotocol/core"
import { modelGenerateInputSchema, modelGenerateOutputSchema } from "@executioncontrolprotocol/types"
import { z } from "zod"
import { resolveOpenaiApiKey } from "./resolve-api-key.js"

async function chatComplete(
  apiKey: string,
  model: string,
  prompt: string,
  system?: string,
  context?: unknown,
  priorMessages?: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const body = {
    model,
    messages: toProviderChatTurns({
      system,
      messages: priorMessages,
      prompt,
      context,
    }),
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`)
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>
  }
  return data.choices[0]?.message?.content ?? ""
}

/** @executioncontrolprotocol/openai extension. @category Extensions */
export const openaiExtension = defineExtension("@executioncontrolprotocol", "openai")
  .withSupportedRuntimes([NODE_RUNTIME_ID])
  .withConfig({
    apiKey: z.string().optional(),
    defaultModel: z.string().optional(),
  })
  .withMetadata({
    summary: "Hosted cloud chat completion for Node hosts.",
    description:
      "Calls the OpenAI Chat Completions API for text generation and harness evaluation. Requires a configured API key and runs on Node runtimes.",
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/openai", "generate")
      .withInput(modelGenerateInputSchema)
      .withOutput(modelGenerateOutputSchema)
      .withMetadata({
        summary: "Generate text via a hosted cloud chat API.",
        description:
          "Runs chat completion against a remote model endpoint. Suited for production Node workloads that need widely available frontier models. Requires a configured API key. Does not accept file attachments yet.",
        useCases: [
          "Server-side workflow step drafts content with a cloud model.",
          "CLI or harness invokes a hosted model for integration tests.",
        ],
        samplePrompts: [
          "Generate a summary of this workflow using the cloud model.",
          "Complete this chat turn with gpt-4o-mini.",
        ],
      })
      .withHandler(async (input, ctx) => {
        const parsed = modelGenerateInputSchema.parse(input)
        if (parsed.files && parsed.files.length > 0) {
          throw new Error(
            "@executioncontrolprotocol/openai.generate does not support files yet"
          )
        }
        const cfg = (ctx as { extensionConfig?: Record<string, unknown> }).extensionConfig ?? {}
        const apiKey = resolveOpenaiApiKey(cfg)
        if (!apiKey) throw new Error("OpenAI API key required")
        const model = parsed.model ?? (cfg.defaultModel as string) ?? "gpt-4o-mini"
        ctx.usage.increment({ modelCalls: 1 })
        const text = await chatComplete(
          apiKey,
          model,
          parsed.prompt,
          parsed.system,
          parsed.context,
          parsed.messages
        )
        return { text }
      }),
    capabilityFor("@executioncontrolprotocol/openai", "evaluate")
      .withInput(
        z.object({
          artifact: z.unknown(),
          criteria: z.unknown().optional(),
          goal: z.string().optional(),
        })
      )
      .withOutput(z.object({ approved: z.boolean(), feedback: z.string().optional() }))
      .withMetadata({
        summary: "Judge harness outputs with a hosted cloud model.",
        description:
          "Scores an artifact against a goal and optional criteria, returning approved and feedback fields. Skips when no API key is configured. Used by harness quality gates, not end-user chat.",
        useCases: [
          "Harness eval needs a cloud judge when local models are unavailable.",
          "Quality gate approves generated workflow patches before merge.",
        ],
        samplePrompts: [
          "Evaluate this artifact against the harness rubric.",
          "Did the model output meet the stated goal?",
        ],
      })
      .withHandler(async (input, ctx) => {
        const prompt = `Evaluate: ${(input as { goal?: string }).goal ?? "quality check"}. Reply JSON {approved:boolean,feedback:string}`
        const cfg = (ctx as { extensionConfig?: Record<string, unknown> }).extensionConfig ?? {}
        const apiKey = resolveOpenaiApiKey(cfg)
        if (!apiKey) return { approved: true, feedback: "skipped (no API key)" }
        const content = await chatComplete(apiKey, "gpt-4o-mini", prompt, undefined, input)
        try {
          return JSON.parse(content) as { approved: boolean; feedback?: string }
        } catch {
          return { approved: true, feedback: content }
        }
      }),
  ])
  .build()

catalogExtension(openaiExtension)

/** Register @executioncontrolprotocol/openai. */
export async function registerOpenaiExtension(registry: Registry = globalRegistry): Promise<void> {
  if (!registry.getExtension("@executioncontrolprotocol/openai")) {
    await registry.registerExtension(openaiExtension)
  }
}

export default openaiExtension
