import type { z } from "zod"
import { AdobeServiceError, INPUT_INVALID } from "../errors.js"

/**
 * Which top-level input keys are path, query, header and hoisted JSON-body fields.
 * @category Runtime
 */
export interface AdobeParameterMap {
  /** Path template parameters. */
  path?: string[]
  /** Query string parameters. */
  query?: string[]
  /** Request headers (never auth). */
  headers?: string[]
  /** JSON body fields hoisted from the request schema. */
  body?: string[]
}

/**
 * Request body rules for one operation.
 * @category Runtime
 */
export interface AdobeBodyRules {
  /** Input key groups. */
  parameters?: AdobeParameterMap
  /** The API's JSON request schema; the merged body must pass it. */
  bodySchema?: z.ZodType
  /** The API requires a body, so an empty merge is still validated. */
  bodyRequired?: boolean
  /** Default `caiClaimVersion` to 2 when the body has an image input (Firefly v3 image APIs). */
  defaultCaiClaimVersion?: boolean
}

/**
 * HTTP pieces assembled from a flat capability input.
 * @category Runtime
 */
export interface AssembledAdobeRequest {
  /** Path template values. */
  path: Record<string, string | number | boolean>
  /** Query string values. */
  query: Record<string, string | number | boolean>
  /** Extra headers. */
  headers: Record<string, string>
  /** JSON body after the parameter merge, or undefined when nothing is sent. */
  body?: unknown
}

/**
 * Body keys that mean the request carries an image input (Content Credentials claim).
 * @category Runtime
 */
export const CAI_IMAGE_INPUT_KEYS = ["image", "mask", "structure", "style", "referenceBlobs", "background", "object"] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function pickDefined(input: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    if (input[key] !== undefined) out[key] = input[key]
  }
  return out
}

function scalar(value: unknown): string | number | boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  return JSON.stringify(value)
}

function scalars(values: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(values)) out[key] = scalar(value)
  return out
}

/**
 * Shallow-merge a JSON document under explicitly set parameters: `{ ...body, ...set }`.
 * Undefined parameters are omitted so they never wipe a `body` key; nested objects and arrays
 * replace as a whole. A non-object `body` with parameters set is an input error.
 * @category Runtime
 */
export function mergeParameterBody(body: unknown, parameters: Record<string, unknown>): unknown {
  const set = pickDefined(parameters, Object.keys(parameters))
  if (Object.keys(set).length === 0) return body
  if (body === undefined) return { ...set }
  if (!isPlainObject(body)) {
    throw new AdobeServiceError(INPUT_INVALID, "body must be a JSON object when body fields are also set as parameters.", {
      issues: [{ path: "body", message: "Expected an object." }],
    })
  }
  return { ...body, ...set }
}

/**
 * Default `caiClaimVersion` to 2 when the body has an image input and the field is unset
 * (Firefly edits of Firefly outputs need claim 2.x).
 * @category Runtime
 */
export function ensureDefaultCaiClaimVersion(body: unknown): unknown {
  if (!isPlainObject(body) || body.caiClaimVersion !== undefined) return body
  const hasImageInput = CAI_IMAGE_INPUT_KEYS.some((key) => body[key] !== undefined)
  return hasImageInput ? { ...body, caiClaimVersion: 2 } : body
}

/**
 * Build path, query, headers and JSON body from a flat capability input. When the operation
 * has a body schema, the merged body is parsed against it so unknown keys and missing required
 * fields fail here with issue paths instead of reaching Adobe.
 * @category Runtime
 */
export function assembleAdobeOperationInput(input: Record<string, unknown>, rules: AdobeBodyRules = {}): AssembledAdobeRequest {
  const parameters = rules.parameters ?? {}
  const path = scalars(pickDefined(input, parameters.path ?? []))
  const query = scalars(pickDefined(input, parameters.query ?? []))
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(pickDefined(input, parameters.headers ?? []))) headers[key] = String(scalar(value))

  const bodyParams = pickDefined(input, parameters.body ?? [])
  const hasBodyParam = Object.keys(bodyParams).length > 0
  const hasBody = input.body !== undefined

  let body: unknown
  if (rules.bodySchema && (hasBody || hasBodyParam || rules.bodyRequired)) {
    const merged = mergeParameterBody(input.body, bodyParams) ?? {}
    const parsed = rules.bodySchema.safeParse(merged)
    if (!parsed.success) {
      throw new AdobeServiceError(INPUT_INVALID, "The Adobe request body does not match the API schema.", {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      })
    }
    body = rules.defaultCaiClaimVersion ? ensureDefaultCaiClaimVersion(parsed.data) : parsed.data
  } else if (hasBody) {
    body = input.body
  }

  return { path, query, headers, ...(body === undefined ? {} : { body }) }
}

/**
 * Drop the job envelope: a body with a `result` object becomes that object. Other bodies are
 * returned unchanged.
 * @category Runtime
 */
export function unwrapAdobeResult(value: unknown): unknown {
  if (!isPlainObject(value)) return value
  return isPlainObject(value.result) ? value.result : value
}

/**
 * Default generate-manifest output: embedded JSON, so reading layers only needs `image`.
 * @category Runtime
 */
export const DEFAULT_MANIFEST_OUTPUTS = [{ destination: { embedded: "json" }, mediaType: "application/json" }] as const

function manifestOutputs(): Record<string, unknown>[] {
  return DEFAULT_MANIFEST_OUTPUTS.map((entry) => ({ destination: { ...entry.destination }, mediaType: entry.mediaType }))
}

/**
 * Fill `outputs` with {@link DEFAULT_MANIFEST_OUTPUTS} when neither the parameter nor `body`
 * sets a non-empty list.
 * @category Runtime
 */
export function withDefaultManifestOutputs(input: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(input.outputs) && input.outputs.length > 0) return input
  const body = input.body
  if (isPlainObject(body) && Array.isArray(body.outputs) && body.outputs.length > 0) return input
  return { ...input, outputs: manifestOutputs() }
}

function parseEmbeddedJsonContent(content: unknown, embedded: unknown): unknown {
  if (typeof content !== "string" || embedded !== "json") return content
  try {
    return JSON.parse(content)
  } catch {
    return content
  }
}

function liftOneManifestOutput(entry: unknown): unknown {
  if (!isPlainObject(entry)) return entry
  const destination = entry.destination
  if (!isPlainObject(destination) || !Object.prototype.hasOwnProperty.call(destination, "content")) return entry
  const lifted = parseEmbeddedJsonContent(destination.content, destination.embedded)
  if (!isPlainObject(lifted) && typeof lifted !== "string") return entry
  return { ...entry, content: lifted, destination }
}

/**
 * Copy embedded manifest JSON from `outputs[i].destination.content` onto `outputs[i].content`
 * without removing `destination`. Parsed when `embedded` is `json` and `content` is a string.
 * @category Runtime
 */
export function liftManifestOutputContent(value: unknown): unknown {
  if (!isPlainObject(value) || !Array.isArray(value.outputs)) return value
  const outputs = value.outputs.map((entry) => liftOneManifestOutput(entry))
  return { ...value, outputs }
}
