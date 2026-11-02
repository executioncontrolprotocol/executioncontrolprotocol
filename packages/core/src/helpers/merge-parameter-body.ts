import { ECP_INPUT_INVALID, EcpError } from "../types/index.js"

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function setParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

/**
 * Shallow-merge an API JSON document under explicitly set capability parameters.
 *
 * Spread is `{ ...body, ...setParameters }`. A set parameter replaces that key.
 * Keys only present on `body` stay. `undefined` parameter values are omitted so
 * they do not wipe `body`. Nested objects and arrays replace as a whole.
 *
 * @category Extensions
 */
export function mergeParameterBody(
  body: unknown,
  parameters: Record<string, unknown>
): unknown {
  const set = setParameters(parameters)
  const hasSet = Object.keys(set).length > 0

  if (!hasSet) {
    return body
  }

  if (body === undefined) {
    return { ...set }
  }

  if (!isPlainObject(body)) {
    throw new EcpError(
      ECP_INPUT_INVALID,
      "body must be a JSON object when parameters are set",
      { path: "body" }
    )
  }

  return { ...body, ...set }
}
