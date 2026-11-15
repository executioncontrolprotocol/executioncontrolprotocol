import { IMPLEMENTATION_IDS, type Formatter } from "@executioncontrolprotocol/protocol"

/**
 * Pretty JSON formatter (2 spaces, stable object key order).
 * @category Formatters
 */
export class JsonFormatter implements Formatter {
  /** Implementation id. */
  static readonly id = IMPLEMENTATION_IDS.jsonFormatter

  /** Media type. */
  readonly mediaType = "application/json"

  /** Accepts the service context (unused). */
  constructor(_ctx?: unknown) {}

  /** Render a JSON value. */
  format(value: unknown): string {
    return `${JSON.stringify(sortKeys(value), null, 2)}\n`
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortKeys(item))
  if (value === null || typeof value !== "object") return value
  const output: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    output[key] = sortKeys((value as Record<string, unknown>)[key])
  }
  return output
}
