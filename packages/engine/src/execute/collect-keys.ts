import type { JsonValue } from "@executioncontrolprotocol/protocol"

/** Collect every top-level state `as` key a loop body may write (static, for count-0 / empty-items). */
export function collectLoopBodyExportKeys(
  steps: unknown[],
  asKey: string,
  asIndexKey: string,
): Set<string> {
  const keys = new Set<string>()
  const walk = (nodes: unknown[]): void => {
    for (const raw of nodes) {
      if (!isRecord(raw)) continue
      const type = typeof raw.type === "string" ? raw.type : "step"
      if (type === "step" && typeof raw.as === "string" && raw.as !== asKey && raw.as !== asIndexKey) {
        keys.add(raw.as)
      }
      if (type === "if") {
        if (Array.isArray(raw.then)) walk(raw.then)
        if (Array.isArray(raw.else)) walk(raw.else)
      }
      if (type === "loop" && Array.isArray(raw.steps)) {
        walk(raw.steps)
      }
      if (type === "parallel" && Array.isArray(raw.paths)) {
        for (const path of raw.paths) {
          if (Array.isArray(path)) walk(path)
        }
      }
    }
  }
  walk(steps)
  return keys
}

/** Keys written on `itemState` compared with `base`, excluding loop iteration bindings. */
export function diffWrittenKeys(
  base: Record<string, unknown>,
  itemState: Record<string, unknown>,
  exclude: readonly string[],
): Record<string, JsonValue> {
  const excludeSet = new Set(exclude)
  const out: Record<string, JsonValue> = {}
  for (const key of Object.keys(itemState)) {
    if (excludeSet.has(key)) continue
    if (!Object.is(itemState[key], base[key])) {
      out[key] = itemState[key] as JsonValue
    }
  }
  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}