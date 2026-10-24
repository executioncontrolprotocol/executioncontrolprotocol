import { createHash } from "node:crypto"
import { MCP_TOOL_HASH_LENGTH, MCP_TOOL_NAME_MAX } from "./constants.js"

const DISALLOWED = /[^A-Za-z0-9_-]/g

/**
 * Replace characters Claude clients reject in tool names.
 * @category MCP
 */
export function sanitizeMcpToolName(raw: string): string {
  return raw.replace(DISALLOWED, "_")
}

function hash6(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, MCP_TOOL_HASH_LENGTH)
}

function withHash(sanitized: string, original: string): string {
  const hash = hash6(original)
  const prefixMax = MCP_TOOL_NAME_MAX - 1 - MCP_TOOL_HASH_LENGTH
  const base = (sanitized.length > 0 ? sanitized : "tool").slice(0, prefixMax)
  return `${base}_${hash}`
}

/**
 * Fit a sanitized name into {@link MCP_TOOL_NAME_MAX} characters.
 * Names longer than 64 characters are truncated and given a 6-character hash.
 * @category MCP
 */
export function fitMcpToolName(sanitized: string, original: string): string {
  if (sanitized.length > 0 && sanitized.length <= MCP_TOOL_NAME_MAX) return sanitized
  return withHash(sanitized, original)
}

/**
 * Allocate a unique MCP tool name, hashing on overflow or collision.
 * @category MCP
 */
export function uniqueMcpToolName(raw: string, used: Set<string>): string {
  const sanitized = sanitizeMcpToolName(raw)
  const fitted = fitMcpToolName(sanitized, raw)
  if (!used.has(fitted)) {
    used.add(fitted)
    return fitted
  }
  const disambiguated = withHash(fitted, `${raw}#${used.size}`)
  used.add(disambiguated)
  return disambiguated
}

/**
 * Capability tool name: `<extension name>_<capability>`, sanitized and unique.
 * @category MCP
 */
export function capabilityToolName(
  extensionName: string,
  capabilityName: string,
  used: Set<string>
): string {
  return uniqueMcpToolName(`${extensionName}_${capabilityName}`, used)
}
