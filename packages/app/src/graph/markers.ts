import type {
  ExprMarker,
  RefMarker,
  ScriptMarker,
  StateMarker,
} from "@executioncontrolprotocol/protocol"
import { isJsonObject } from "./json-schema.js"

/**
 * Whether a value is a `$ref` marker.
 * @category App
 */
export function isRefMarker(value: unknown): value is RefMarker {
  if (!isJsonObject(value)) return false
  const ref = value.$ref
  if (typeof ref === "string") return true
  return Array.isArray(ref) && ref.length > 0 && ref.every((entry) => typeof entry === "string")
}

/**
 * State paths on a `$ref` marker, when present.
 * @category App
 */
export function refPathsFromValue(value: unknown): readonly string[] | undefined {
  if (!isRefMarker(value)) return undefined
  const ref = value.$ref
  return typeof ref === "string" ? [ref] : ref
}

/**
 * Whether a value is a `$state` marker.
 * @category App
 */
export function isStateMarker(value: unknown): value is StateMarker {
  return isJsonObject(value) && typeof value.$state === "string"
}

/**
 * Whether a value is a `$expr` marker.
 * @category App
 */
export function isExprMarker(value: unknown): value is ExprMarker {
  return isJsonObject(value) && typeof value.$expr === "string"
}

/**
 * Whether a value is a `$script` marker.
 * @category App
 */
export function isScriptMarker(value: unknown): value is ScriptMarker {
  return isJsonObject(value) && isJsonObject(value.$script)
}

/**
 * State path a `$ref` or `$state` marker points at, or `undefined` for other values.
 * For a merge port (`$ref` list), returns the first path.
 * @category App
 */
export function refPathFromValue(value: unknown): string | undefined {
  return refPathsFromValue(value)?.[0]
}