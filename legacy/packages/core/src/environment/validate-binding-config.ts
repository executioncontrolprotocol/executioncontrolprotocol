import type { ConfigSchema } from "../config-schema/index.js"
import { ECP_BINDING_INVALID, EcpError } from "../types/index.js"

function isPlaceholder(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ("$secret" in value || "$env" in value)
  )
}

/**
 * Replace `$secret` / `$env` objects with a string so they satisfy string fields.
 * @category Environment
 */
export function substituteConfigPlaceholders(value: unknown): unknown {
  if (isPlaceholder(value)) return ""
  if (Array.isArray(value)) return value.map(substituteConfigPlaceholders)
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      out[key] = substituteConfigPlaceholders(child)
    }
    return out
  }
  return value
}

/**
 * Validate bound config against a definition's `withConfig` schema.
 * @category Environment
 */
export function validateBoundConfig(
  schema: ConfigSchema | undefined,
  config: Record<string, unknown>,
  bindingId: string,
  phase: "placeholder" | "resolved"
): void {
  if (!schema) return
  const candidate =
    phase === "placeholder"
      ? (substituteConfigPlaceholders(config) as Record<string, unknown>)
      : config
  const parsed = schema.safeParse(candidate)
  if (parsed.success) return
  const issue = parsed.error.issues[0]
  const path = issue?.path.length ? issue.path.map(String).join(".") : undefined
  throw new EcpError(
    ECP_BINDING_INVALID,
    `Binding ${bindingId} config is invalid${path ? ` at ${path}` : ""}: ${issue?.message ?? parsed.error.message}`,
    { path: path ? `${bindingId}.${path}` : bindingId }
  )
}
