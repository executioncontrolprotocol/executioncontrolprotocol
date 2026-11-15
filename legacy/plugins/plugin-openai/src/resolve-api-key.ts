/** Resolve OpenAI API key from extension config, optionally process.env on Node. */
export function resolveOpenaiApiKey(cfg: Record<string, unknown>): string {
  const fromConfig = cfg.apiKey as string | undefined
  if (fromConfig) return fromConfig
  if (typeof process !== "undefined" && process.env?.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY
  }
  return ""
}
