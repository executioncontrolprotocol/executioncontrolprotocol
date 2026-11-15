const SECRET_PREFIX = "[secret:"
const SECRET_SUFFIX = "]"

const recorded = new Map<string, string>()

/**
 * Record a resolved secret so later journal writes can redact it.
 * @category Journal
 */
export function recordResolvedSecret(key: string, value: unknown): void {
  if (typeof value === "string" && value.length > 0) {
    recorded.set(value, key)
  }
}

/**
 * Marker written in place of a secret value.
 * @category Journal
 */
export function secretMarker(key: string): string {
  return `${SECRET_PREFIX}${key}${SECRET_SUFFIX}`
}

/**
 * Replace recorded secret values with `[secret:<key>]`.
 * @category Journal
 */
export function redactSecrets<T>(value: T): T {
  return redactWalk(value, new WeakSet()) as T
}

function redactWalk(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    const key = recorded.get(value)
    return key ? secretMarker(key) : value
  }
  if (value === null || value === undefined) return value
  if (typeof value !== "object") return value
  if (seen.has(value as object)) return value
  seen.add(value as object)
  if (Array.isArray(value)) {
    return value.map((item) => redactWalk(item, seen))
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = redactWalk(v, seen)
  }
  return out
}
