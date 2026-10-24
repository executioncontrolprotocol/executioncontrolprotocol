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
  }
}

/**
 * Structured capability input produced by codegen.
 * @category Runtime
 */
export interface AdobeOperationInput {
  /** Path template params. */
  path?: Record<string, string | number | boolean>
  /** Query string params. */
  query?: Record<string, string | number | boolean | undefined>
  /** Extra headers (non-auth). */
  headers?: Record<string, string>
  /** JSON body. */
  body?: unknown
  /** Poll interval (async-submit only). */
  pollIntervalMs?: number
  /** Poll timeout (async-submit only). */
  pollTimeoutMs?: number
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
    options.input.path ?? {},
    options.input.query,
  )

  const raw = await client.request({
    method: options.method,
    url,
    body: options.input.body,
    headers: options.input.headers,
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
      intervalMs: options.input.pollIntervalMs,
      timeoutMs: options.input.pollTimeoutMs,
    })

    if (options.materialize === "photoshop-manifest") {
      result = await materializePhotoshopManifest({
        jobStatus: result,
        requestBody: options.input.body,
      })
    }
  }

  const parsed = options.outputSchema.safeParse(result)
  if (!parsed.success) {
    throw new Error(`Adobe response failed output schema: ${parsed.error.message}`)
  }
  return parsed.data
}
