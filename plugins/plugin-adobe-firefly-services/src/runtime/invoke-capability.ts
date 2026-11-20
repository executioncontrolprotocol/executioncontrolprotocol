import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"
import { getImsTokenProvider } from "../auth/ims.js"
import { resolveAdobeConfig } from "../config.js"
import { AdobeServiceError, INPUT_INVALID, PROVIDER_ERROR } from "../errors.js"
import { extractAdobeStatusUrl, pollAdobeJob } from "../http/async-job.js"
import { buildUrl, createAdobeHttpClient, redactUrl, type AdobeHttpMethod } from "../http/client.js"
import {
  assembleAdobeOperationInput,
  liftManifestOutputContent,
  unwrapAdobeResult,
  withDefaultManifestOutputs,
  type AdobeBodyRules,
} from "./assemble.js"
import { shapeAdobeOutput, type AdobeProductShape } from "./product-shape.js"

/**
 * One generated operation: the HTTP call behind a capability. Generated into
 * `src/generated/<family>/operations.ts`.
 * @category Runtime
 */
export interface AdobeOperation extends AdobeBodyRules {
  /** HTTP method. */
  method: AdobeHttpMethod
  /** OpenAPI path template. */
  path: string
  /** Server URL from the spec; the config's `baseUrl` replaces it. */
  serverUrl: string
  /** `submit` polls the returned status URL and returns the job result; `none` returns the response. */
  asyncMode: "submit" | "none"
  /** Fill photoshop generate-manifest `outputs` with embedded JSON when unset. */
  defaultManifestOutputs?: boolean
  /** How to map the API document to product-shaped capability output. */
  productShape?: AdobeProductShape
  /** Body fields that accept a url FileRef at the capability boundary. */
  fileRefBodyFields?: string[]
}

/**
 * Handler shared by every generated capability.
 * @category Runtime
 */
export type AdobeHandler = (input: unknown, ctx: HandlerContext) => Promise<unknown>

/**
 * Module shape a lazy `handler` thunk resolves to.
 * @category Runtime
 */
export interface AdobeHandlerModule {
  /** The handler. */
  default: AdobeHandler
}

/**
 * Build the handler for one generated operation: validate config, assemble the request, call
 * Adobe with an IMS token cached per credential set, poll async jobs (honouring
 * `ctx.signal`) and return the result document.
 * @category Runtime
 */
export function createAdobeHandler(name: string, operation: AdobeOperation): AdobeHandler {
  return async (input, ctx) => {
    const config = resolveAdobeConfig(ctx.config)
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new AdobeServiceError(INPUT_INVALID, `${name} input must be a JSON object.`, {
        issues: [{ path: "", message: "Expected an object." }],
      })
    }
    const flat = operation.defaultManifestOutputs
      ? withDefaultManifestOutputs(input as Record<string, unknown>)
      : (input as Record<string, unknown>)
    const assembled = assembleAdobeOperationInput(flat, operation)

    const getAccessToken = getImsTokenProvider(config)
    const client = createAdobeHttpClient({ clientId: config.clientId, getAccessToken })
    const url = buildUrl(config.baseUrl ?? operation.serverUrl, operation.path, assembled.path, assembled.query)

    const response = await client.request({
      method: operation.method,
      url,
      body: assembled.body,
      headers: assembled.headers,
      signal: ctx.signal,
    })
    if (operation.asyncMode !== "submit") {
      return shapeAdobeOutput(response ?? {}, operation.productShape, flat)
    }

    const statusUrl = extractAdobeStatusUrl(response)
    if (!statusUrl) {
      throw new AdobeServiceError(PROVIDER_ERROR, `Adobe accepted ${name} but returned no job status URL.`, {
        method: operation.method,
        url: redactUrl(url),
      })
    }
    ctx.logger.debug(`Adobe job submitted for ${name}; polling.`, { statusUrl: redactUrl(statusUrl) })
    const final = await pollAdobeJob({
      statusUrl,
      client,
      signal: ctx.signal,
      intervalMs: config.pollIntervalMs,
      timeoutMs: config.pollTimeoutMs,
    })
    let unwrapped: unknown = unwrapAdobeResult(final) ?? {}
    if (operation.defaultManifestOutputs) unwrapped = liftManifestOutputContent(unwrapped)
    return shapeAdobeOutput(unwrapped, operation.productShape, flat)
  }
}
