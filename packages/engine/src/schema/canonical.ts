/**
 * Canonical JSON (sorted object keys) and its SHA-256.
 * Uses the platform Web Crypto API so the engine does not import Node.
 * @category Validation
 */

/**
 * Serialize a JSON value with object keys sorted at every level.
 * @category Validation
 */
export function canonicalJson(value: unknown): string {
  return stringify(value)
}

/**
 * SHA-256 hex digest of a string.
 * @category Validation
 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function stringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map((item) => stringify(item)).join(",")}]`
  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stringify((value as Record<string, unknown>)[key])}`)
  return `{${entries.join(",")}}`
}
