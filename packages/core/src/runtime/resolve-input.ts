import type { InputValue, RefValue, StateValue } from "@executioncontrolprotocol/types"

function getStatePath(ref: string): string {
  return ref.startsWith("state.") ? ref.slice(6) : ref
}

function getAtPath(state: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".")
  let cur: unknown = state
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

/** Resolve $ref values from committed state. */
export function resolveStepInput(
  input: Record<string, InputValue> | undefined,
  state: Record<string, unknown>
): Record<string, unknown> {
  if (!input) return {}

  function resolveValue(v: InputValue): unknown {
    if (v !== null && typeof v === "object") {
      if ("$ref" in v) {
        const r = v as RefValue
        const val = getAtPath(state, getStatePath(r.$ref))
        if (val === undefined && r.optional) return r.fallback
        return val
      }
      if ("$state" in v) {
        return v as StateValue
      }
      if (Array.isArray(v)) return v.map((x) => resolveValue(x as InputValue))
      const out: Record<string, unknown> = {}
      for (const [k, child] of Object.entries(v)) {
        out[k] = resolveValue(child as InputValue)
      }
      return out
    }
    return v
  }

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    out[k] = resolveValue(v)
  }
  return out
}
