/** Resolve FAL API key from extension config, optionally process.env on Node. */
export function resolveFalApiKey(cfg: Record<string, unknown>): string {
  const fromConfig = cfg.apiKey as string | undefined
  if (fromConfig) return fromConfig
  if (typeof process !== "undefined" && process.env?.FAL_KEY) {
    return process.env.FAL_KEY
  }
  return ""
}
