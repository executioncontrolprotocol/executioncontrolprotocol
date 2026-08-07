import {
  catalogExtension,
  capabilityFor,
  defineExtension,
  globalRegistry,
  type Registry,
} from "@executioncontrolprotocol/core"
import { modelGenerateInputSchema, modelGenerateOutputSchema } from "@executioncontrolprotocol/types"
import { z } from "zod"

async function claudeComplete(
  apiKey: string,
  model: string,
  prompt: string,
  system?: string
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`)
  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>
  }
  return data.content.find((c) => c.type === "text")?.text ?? ""
}

/** Claude model provider. @category Extensions */
export const claudeExtension = defineExtension("@executioncontrolprotocol", "claude")
  .withConfig({
    apiKey: z.string().optional(),
    defaultModel: z.string().optional(),
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/claude", "generate")
      .withInput(modelGenerateInputSchema)
      .withOutput(modelGenerateOutputSchema)
      .withHandler(async (raw, ctx) => {
        const input = modelGenerateInputSchema.parse(raw)
        const cfg = (ctx as { extensionConfig?: Record<string, unknown> }).extensionConfig ?? {}
        const apiKey = (cfg.apiKey as string) ?? ""
        if (!apiKey) throw new Error("Claude API key required")
        const model =
          input.model ?? (cfg.defaultModel as string) ?? "claude-3-5-haiku-latest"
        ctx.usage.increment({ modelCalls: 1 })
        const text = await claudeComplete(apiKey, model, input.prompt, input.system)
        return { text }
      }),
  ])
  .build()

catalogExtension(claudeExtension)

/** Register Claude extension. @category Extensions */
export async function registerClaudeExtension(registry: Registry = globalRegistry): Promise<void> {
  if (!registry.getExtension("@executioncontrolprotocol/claude")) {
    await registry.registerExtension(claudeExtension)
  }
}
