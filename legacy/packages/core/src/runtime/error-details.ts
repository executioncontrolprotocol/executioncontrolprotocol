const OMIT_KEYS = new Set(["stack", "message", "cause"])

/**
 * Recursively copy JSON-safe values. Drops functions, symbols, and cycles.
 * @category Runtime
 */
function jsonSafe(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value
  }
  if (typeof value !== "object") return undefined
  if (seen.has(value)) return undefined
  seen.add(value)
  if (Array.isArray(value)) {
    return value
      .map((item) => jsonSafe(item, seen))
      .filter((item) => item !== undefined)
  }
  const out: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (OMIT_KEYS.has(key)) continue
    const safe = jsonSafe(nested, seen)
    if (safe !== undefined) out[key] = safe
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Fields extracted from a thrown capability error. @category Runtime */
export interface ThrownErrorFields {
  /** JSON-safe own properties plus `name`. */
  details?: Record<string, unknown>
  /** Handler-supplied `output` when present on the thrown value. */
  output?: unknown
}

/**
 * Copy JSON-safe fields from a thrown error for {@link ValidationIssue.details}.
 * @category Runtime
 */
export function detailsFromThrown(err: unknown): ThrownErrorFields {
  if (err === null || err === undefined) return {}
  if (typeof err !== "object") return {}
  const record = err as Record<string, unknown>
  const output = "output" in record ? record.output : undefined
  const details: Record<string, unknown> = {}
  if (err instanceof Error && err.name) details.name = err.name
  for (const [key, nested] of Object.entries(record)) {
    if (key === "output" || OMIT_KEYS.has(key)) continue
    const safe = jsonSafe(nested, new WeakSet())
    if (safe !== undefined) details[key] = safe
  }
  return {
    ...(Object.keys(details).length > 0 ? { details } : {}),
    ...(output !== undefined ? { output } : {}),
  }
}
