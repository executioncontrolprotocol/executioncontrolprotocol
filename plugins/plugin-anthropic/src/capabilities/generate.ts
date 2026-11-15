import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"
import {
  anthropicConfigSchema,
  type AnthropicConfig,
  type GenerateInput,
  type GenerateOutput,
} from "../schemas.js"

const DEFAULT_BASE_URL = "https://api.anthropic.com"
const ANTHROPIC_VERSION = "2023-06-01"
const DEFAULT_MAX_TOKENS = 4096

interface MessagesResponse {
  content?: Array<{ type?: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

function codedError(code: string, message: string, details: Record<string, unknown>): Error {
  return Object.assign(new Error(message), { code, details })
}

function providerErrorMessage(prefix: string, status: number, body: unknown): string {
  const detail =
    isRecord(body) && isRecord(body.error) && typeof body.error.message === "string"
      ? body.error.message
      : isRecord(body) && typeof body.message === "string"
        ? body.message
        : undefined
  return detail
    ? `${prefix} returned HTTP ${status}: ${detail}`
    : `${prefix} returned HTTP ${status}.`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function resolveConfig(raw: unknown): AnthropicConfig {
  const parsed = anthropicConfigSchema.safeParse(raw)
  if (!parsed.success) {
    throw codedError(
      "ECP_CONFIG_INVALID",
      "The anthropic step needs a config object with an apiKey (and optionally model and baseUrl).",
      { issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) },
    )
  }
  return parsed.data
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

/**
 * Generate handler: one Messages API call.
 * @category Plugins
 */
export default async function handler(input: GenerateInput, ctx: HandlerContext): Promise<GenerateOutput> {
  const config = resolveConfig(ctx.config)
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")
  const body = {
    model: config.model,
    max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
    ...(input.system === undefined ? {} : { system: input.system }),
    messages: [{ role: "user", content: input.prompt }],
  }

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
    signal: ctx.signal,
  })

  if (!res.ok) {
    const body = await readBody(res)
    throw codedError("ECP_PROVIDER_ERROR", providerErrorMessage("Anthropic Messages API", res.status, body), {
      status: res.status,
      body,
    })
  }

  const data = (await res.json()) as MessagesResponse
  const text = (data.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("")
  const inputTokens = data.usage?.input_tokens ?? 0
  const outputTokens = data.usage?.output_tokens ?? 0

  ctx.usage.record({ kind: "tokens.in", amount: inputTokens, unit: "token" })
  ctx.usage.record({ kind: "tokens.out", amount: outputTokens, unit: "token" })

  return { text, usage: { inputTokens, outputTokens } }
}
