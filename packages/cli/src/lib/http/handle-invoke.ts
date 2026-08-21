import type { IncomingMessage, ServerResponse } from "node:http"
import {
  hydrateCapabilityBlobs,
  type CapabilityBlobStore,
  type Ecp,
  type SerializedCapabilityBlob,
} from "@executioncontrolprotocol/core"
import { readRequestBody } from "./read-body.js"
import { writeJson } from "./write-json.js"
import {
  ECP_INVOKE_ERROR_CODES,
  LATEST_ECP_VERSION,
  httpStatusForInvokeResult,
  type CapabilityId,
  type InvokeResult,
} from "@executioncontrolprotocol/types"

/** JSON body for `POST /v1/invoke`. @category CLI */
export interface InvokeHttpBody {
  /** Capability id to invoke. */
  capability?: string
  /** Capability input payload. */
  input?: unknown
  /** Optional provider capability override (harness `.uses`). */
  provider?: string
  /** Browser file blobs hopped with locator refs (transport only). */
  blobs?: Record<string, SerializedCapabilityBlob>
}

/** Parsed invoke body. @category CLI */
export interface ParsedInvokeBody {
  /** Capability id. */
  capability: string
  /** Input payload. */
  input: unknown
  /** Optional provider override. */
  provider?: string
  /** Optional hopped blobs. */
  blobs?: Record<string, SerializedCapabilityBlob>
}

/**
 * Parse and validate a `/v1/invoke` request body.
 * @category CLI
 */
export function parseInvokeBody(
  raw: string
): { ok: true; body: ParsedInvokeBody } | { ok: false; error: string } {
  let parsed: InvokeHttpBody
  try {
    parsed = raw.trim() ? (JSON.parse(raw) as InvokeHttpBody) : {}
  } catch {
    return { ok: false, error: "Invalid JSON body" }
  }
  if (typeof parsed.capability !== "string" || !parsed.capability.trim()) {
    return { ok: false, error: "capability is required" }
  }
  const blobs =
    parsed.blobs && typeof parsed.blobs === "object" && !Array.isArray(parsed.blobs)
      ? parsed.blobs
      : undefined
  return {
    ok: true,
    body: {
      capability: parsed.capability,
      input: parsed.input ?? {},
      ...(typeof parsed.provider === "string" && parsed.provider.trim()
        ? { provider: parsed.provider }
        : {}),
      ...(blobs ? { blobs } : {}),
    },
  }
}

/**
 * Resolve the host blob store when the operational ECP supports hop hydration.
 * Older `@executioncontrolprotocol/core` builds (no {@link Ecp.getBlobStore}) return undefined.
 * @category CLI
 */
export function resolveInvokeBlobStore(ecp: Ecp): CapabilityBlobStore | undefined {
  if (typeof ecp.getBlobStore !== "function") return undefined
  return ecp.getBlobStore()
}

/**
 * Failed invoke result when the host cannot accept hopped browser blobs.
 * @category CLI
 */
export function blobHopUnsupportedResult(capabilityId: string): InvokeResult {
  return {
    schema: "@executioncontrolprotocol.invoke.result",
    version: LATEST_ECP_VERSION,
    success: false,
    capabilityId: capabilityId as CapabilityId,
    diagnostics: [
      {
        severity: "error",
        code: ECP_INVOKE_ERROR_CODES.INVOKE_FAILED,
        message:
          "Host environment does not support browser blob hop (upgrade @executioncontrolprotocol/core / node used by --env).",
      },
    ],
  }
}

/**
 * Run `ecp.invoke` for a parsed invoke body and return the result.
 * @category CLI
 */
export async function runHttpInvoke(ecp: Ecp, body: ParsedInvokeBody) {
  if (body.blobs) {
    const store = resolveInvokeBlobStore(ecp)
    if (!store) {
      return blobHopUnsupportedResult(body.capability)
    }
    hydrateCapabilityBlobs(store, body.blobs)
  }
  const builder = ecp.invoke(body.capability).with(body.input)
  return (body.provider ? builder.uses(body.provider) : builder).process()
}

/**
 * Handle `POST /v1/invoke`: read body, invoke, write JSON result.
 * Does not perform authentication.
 * @category CLI
 */
export async function handleInvokePost(
  ecp: Ecp,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  let raw: string
  try {
    raw = await readRequestBody(req)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    writeJson(res, 400, { error: message })
    return
  }

  const parsed = parseInvokeBody(raw)
  if (!parsed.ok) {
    writeJson(res, 400, { error: parsed.error })
    return
  }

  try {
    const result = await runHttpInvoke(ecp, parsed.body)
    writeJson(res, httpStatusForInvokeResult(result), result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    writeJson(res, 500, { error: message })
  }
}
