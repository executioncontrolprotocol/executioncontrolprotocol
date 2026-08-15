import type { IncomingMessage, ServerResponse } from "node:http"
import type { Ecp } from "@executioncontrolprotocol/core"
import { readRequestBody } from "./read-body.js"
import { writeJson } from "./write-json.js"

/** JSON body for `POST /v1/invoke`. @category CLI */
export interface InvokeHttpBody {
  /** Capability id to invoke. */
  capability?: string
  /** Capability input payload. */
  input?: unknown
  /** Optional provider capability override (harness `.uses`). */
  provider?: string
}

/**
 * Parse and validate a `/v1/invoke` request body.
 * @category CLI
 */
export function parseInvokeBody(
  raw: string
): { ok: true; body: { capability: string; input: unknown; provider?: string } } | { ok: false; error: string } {
  let parsed: InvokeHttpBody
  try {
    parsed = raw.trim() ? (JSON.parse(raw) as InvokeHttpBody) : {}
  } catch {
    return { ok: false, error: "Invalid JSON body" }
  }
  if (typeof parsed.capability !== "string" || !parsed.capability.trim()) {
    return { ok: false, error: "capability is required" }
  }
  return {
    ok: true,
    body: {
      capability: parsed.capability,
      input: parsed.input ?? {},
      ...(typeof parsed.provider === "string" && parsed.provider.trim()
        ? { provider: parsed.provider }
        : {}),
    },
  }
}

/**
 * Run `ecp.invoke` for a parsed invoke body and return the result.
 * @category CLI
 */
export async function runHttpInvoke(
  ecp: Ecp,
  body: { capability: string; input: unknown; provider?: string }
) {
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
    writeJson(res, 200, result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    writeJson(res, 500, { error: message })
  }
}
