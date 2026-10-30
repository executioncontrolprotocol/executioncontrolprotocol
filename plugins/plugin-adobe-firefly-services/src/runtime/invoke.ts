import { mergeParameterBody } from "@executioncontrolprotocol/core"
import { z } from "zod"
import { createImsTokenProvider } from "../auth/ims.js"
import { buildUrl, createAdobeHttpClient } from "../http/client.js"
import { extractAdobeStatusUrl, pollAdobeJob } from "../http/async-job.js"
import { materializePhotoshopManifest } from "./photoshop-manifest.js"

/**
 * Capability handler context fields used by Adobe invoke.
 * Core handlers receive `CapabilityContext`; hosts may attach `extensionConfig`.
 * @category Runtime
 */
export interface AdobeInvokeContext {
  /** Bound extension config (from capability runtime). */
  extensionConfig?: {
    clientId?: string
    clientSecret?: string
    scopes?: string
    imsEndpoint?: string
    /** Override async poll interval (ms). Defaults to 2000. */
    pollIntervalMs?: number
    /** Override async poll timeout (ms). Defaults to 120000. */
    pollTimeoutMs?: number
  }
}

/**
 * Flat capability input produced by codegen. Path, query, header, and body
 * fields are top-level keys. Optional `body` is the JSON document to merge.
 * @category Runtime
 */
export type AdobeOperationInput = Record<string, unknown>

/**
 * Which top-level input keys map to path, query, header, and JSON body fields.
 * @category Runtime
 */
export interface AdobeParameterMap {
  /** Path template params. */
  path?: string[]
  /** Query string params. */
  query?: string[]
  /** Extra headers (non-auth). */
  headers?: string[]
  /** JSON body fields hoisted from the request schema. */
  body?: string[]
}

/**
 * HTTP pieces assembled from a flat capability input.
 * @category Runtime
 */
export interface AssembledAdobeRequest {
  /** Path template params. */
  path: Record<string, string | number | boolean>
  /** Query string params. */
  query: Record<string, string | number | boolean | undefined>
  /** Extra headers (non-auth). */
  headers: Record<string, string>
  /** JSON body after parameter merge. */
  body?: unknown
}

/**
 * How the capability treats Adobe's async HTTP pattern.
 * @category Runtime
 */
export type AdobeAsyncMode = "submit" | "none"

/**
 * Optional product materialization after a successful async poll.
 * @category Runtime
 */
export type AdobeMaterializeMode = "photoshop-manifest"

/**
 * Read optional extension config bag from a capability handler context.
 * @category Runtime
 */
export function readExtensionConfig(ctx: unknown): Record<string, unknown> {
  if (!ctx || typeof ctx !== "object") return {}
  const cfg = (ctx as AdobeInvokeContext).extensionConfig
  if (!cfg || typeof cfg !== "object") return {}
  return cfg as Record<string, unknown>
}

function pickDefined(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    const value = input[key]
    if (value !== undefined) out[key] = value
  }
  return out
}

function asPathQueryValue(
  value: unknown,
): string | number | boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value
  }
  return String(value)
}

function asPathRecord(values: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(values)) {
    const next = asPathQueryValue(value)
    if (next !== undefined) out[key] = next
  }
  return out
}

function asQueryRecord(
  values: Record<string, unknown>,
): Record<string, string | number | boolean | undefined> {
  const out: Record<string, string | number | boolean | undefined> = {}
  for (const [key, value] of Object.entries(values)) {
    out[key] = asPathQueryValue(value)
  }
  return out
}

function asHeaderRecord(values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue
    out[key] = String(value)
  }
  return out
}

function optionalPositiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * Drop Adobe job envelopes so capability output is the inner result document.
 * A JSON body with a `result` object becomes that object. Otherwise the body
 * is returned as-is (sync lists, succeeded payloads that are already the product).
 * @category Runtime
 */
export function unwrapAdobeResult(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  const inner = (value as Record<string, unknown>).result
  if (inner !== null && typeof inner === "object" && !Array.isArray(inner)) {
    return inner
  }
  return value
}

/**
 * Build path, query, headers, and JSON body from a flat capability input.
 * When `bodySchema` is set, a provided `body` or any body parameter is merged
 * then parsed against that schema.
 * @category Runtime
 */
export function assembleAdobeOperationInput(
  input: AdobeOperationInput,
  parameters: AdobeParameterMap = {},
  bodySchema?: z.ZodType,
): AssembledAdobeRequest {
  const path = asPathRecord(pickDefined(input, parameters.path ?? []))
  const query = asQueryRecord(pickDefined(input, parameters.query ?? []))
  const headers = asHeaderRecord(pickDefined(input, parameters.headers ?? []))
  const bodyParams = pickDefined(input, parameters.body ?? [])
  const hasBodyParam = Object.keys(bodyParams).length > 0
  const hasBody = input.body !== undefined

  let body: unknown
  if (bodySchema && (hasBody || hasBodyParam)) {
    body = mergeParameterBody(input.body, bodyParams)
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      throw new Error(`Adobe request body failed schema: ${parsed.error.message}`)
    }
  } else if (!bodySchema && hasBody) {
    body = input.body
  }

  return {
    path,
    query,
    headers,
    body,
  }
}

/**
 * Invoke a generated Adobe OpenAPI operation.
 * Async-submit capabilities always poll and return the final result (not job-accepted).
 * @category Runtime
 */
export async function invokeAdobeOperation(options: {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"
  pathTemplate: string
  baseUrl: string
  input: AdobeOperationInput
  /** Path/query/header/body keys on {@link AdobeOperationInput}. */
  parameters?: AdobeParameterMap
  /** Original JSON request schema when body fields were hoisted. */
  bodySchema?: z.ZodType
  /** Capability handler context (`CapabilityContext` + optional `extensionConfig`). */
  ctx: unknown
  outputSchema: z.ZodType
  /** When \`submit\`, always poll status URL and require one. */
  asyncMode?: AdobeAsyncMode
  /** Optional post-poll materialization (e.g. PSD manifest JSON). */
  materialize?: AdobeMaterializeMode
}): Promise<unknown> {
  const rawCfg = readExtensionConfig(options.ctx)
  const clientId = typeof rawCfg.clientId === "string" ? rawCfg.clientId : undefined
  const clientSecret = typeof rawCfg.clientSecret === "string" ? rawCfg.clientSecret : undefined
  if (!clientId || !clientSecret) {
    throw new Error("Adobe clientId and clientSecret are required in extension config")
  }

  const assembled = assembleAdobeOperationInput(
    options.input,
    options.parameters,
    options.bodySchema,
  )

  const getAccessToken = createImsTokenProvider({
    clientId,
    clientSecret,
    scopes: typeof rawCfg.scopes === "string" ? rawCfg.scopes : undefined,
    imsEndpoint: typeof rawCfg.imsEndpoint === "string" ? rawCfg.imsEndpoint : undefined,
  })
  const client = createAdobeHttpClient({ clientId, getAccessToken })

  const url = buildUrl(
    options.baseUrl,
    options.pathTemplate,
    assembled.path,
    assembled.query,
  )

  const raw = await client.request({
    method: options.method,
    url,
    body: assembled.body,
    headers: assembled.headers,
  })

  let result: unknown = raw
  const asyncMode = options.asyncMode ?? "none"

  if (asyncMode === "submit") {
    const statusUrl = extractAdobeStatusUrl(raw)
    if (!statusUrl) {
      throw new Error(
        `Adobe async submit ${options.method} ${options.pathTemplate} returned no status URL`,
      )
    }
    result = await pollAdobeJob({
      statusUrl,
      client,
      intervalMs: optionalPositiveInt(rawCfg.pollIntervalMs),
      timeoutMs: optionalPositiveInt(rawCfg.pollTimeoutMs),
    })

    if (options.materialize === "photoshop-manifest") {
      result = await materializePhotoshopManifest({
        jobStatus: result,
        requestBody: assembled.body,
      })
    } else {
      result = unwrapAdobeResult(result)
    }
  }

  const parsed = options.outputSchema.safeParse(result)
  if (!parsed.success) {
    throw new Error(`Adobe response failed output schema: ${parsed.error.message}`)
  }
  return parsed.data
}
