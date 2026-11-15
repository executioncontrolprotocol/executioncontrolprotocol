import type { SerializableFunction } from "../types/index.js"

/**
 * True when `value` is a portable {@link SerializableFunction}.
 * @category Workflow
 */
export function isSerializableFunction(value: unknown): value is SerializableFunction {
  if (value === null || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  return record.$fn === true && typeof record.source === "string" && record.source.length > 0
}

/**
 * Capture a function as portable source text (no closed-over environment).
 * @category Workflow
 */
export function serializeFunction(
  fn: (...args: never[]) => unknown,
  params: string[] = ["state"]
): SerializableFunction {
  if (typeof fn !== "function") {
    throw new Error("serializeFunction expects a function")
  }
  const source = Function.prototype.toString.call(fn)
  if (/\[native code\]/i.test(source)) {
    throw new Error("Cannot serialize native or bound functions as workflow expressions")
  }
  return {
    $fn: true,
    source,
    ...(params.length > 0 ? { params: [...params] } : {}),
  }
}

/**
 * Rehydrate and invoke a {@link SerializableFunction} from its source text.
 * Outer locals from authoring time are not restored — only the declared parameters.
 * @category Workflow
 */
export function evalSerializableFunction(doc: SerializableFunction, ...args: unknown[]): unknown {
  if (!isSerializableFunction(doc)) {
    throw new Error("Expected a serializable function document ({ $fn: true, source })")
  }
  let rehydrated: unknown
  try {
    rehydrated = new Function(`"use strict"; return (${doc.source});`)()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to rehydrate serializable function: ${message}`)
  }
  if (typeof rehydrated !== "function") {
    throw new Error("Serializable function source did not evaluate to a function")
  }
  return (rehydrated as (...values: unknown[]) => unknown)(...args)
}
