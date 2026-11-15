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
  return isJsonObject(value) && typeof value.$ref === "string"
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
 * @category App
 */
export function refPathFromValue(value: unknown): string | undefined {
  if (isRefMarker(value)) return value.$ref
  if (isStateMarker(value)) return value.$state
  return undefined
}
