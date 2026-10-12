import {
  ECP_INVOKE_ERROR_CODES,
  LATEST_ECP_VERSION,
  type CapabilityId,
  type InvokeResult,
  type ValidationIssue,
  type ValidationResult,
} from "@executioncontrolprotocol/types"

/** Pairing for same-id hops to a local invoke host. @category Runtime */
export interface RemoteInvokeBinding {
  /** Base URL of the invoke host (no trailing slash required). */
  url: string
  /** Bearer token for `POST /v1/invoke`. */
  token: string
}

/**
 * Format a validation issue as `path: message` (or message alone).
 * @category Runtime
 */
export function formatValidationIssueLine(issue: ValidationIssue): string {
  const path = issue.path?.trim()
  return path ? `${path}: ${issue.message}` : issue.message
}

/**
 * Build invoke failure diagnostics, expanding schema validation issues when present.
 * Lead entry keeps the summary code with a joined detail message for single-message consumers.
 * @category Runtime
 */
export function buildInvokeFailureDiagnostics(
  code: string,
  message: string,
  validation?: ValidationResult
): ValidationIssue[] {
  const errors = validation?.errors ?? []
  if (errors.length === 0) {
    return [{ severity: "error", code, message }]
  }
  const joined = errors.map(formatValidationIssueLine).join("; ")
  const lead: ValidationIssue = {
    severity: "error",
    code,
    message: `${message}: ${joined}`,
  }
  const detail: ValidationIssue[] = errors.map((issue) => ({
    ...issue,
    severity: issue.severity ?? "error",
  }))
  return [lead, ...detail]
}

/** Whether a JSON value looks like an invoke result. @category Runtime */
export function isInvokeResult(value: unknown): value is InvokeResult {
  if (value === null || typeof value !== "object") return false
  const row = value as Partial<InvokeResult>
  return (
    row.schema === "@executioncontrolprotocol.invoke.result" &&
    typeof row.success === "boolean" &&
    typeof row.capabilityId === "string" &&
    Array.isArray(row.diagnostics)
  )
}

/**
 * Build a failed invoke result.
 * When `validation.errors` is present, diagnostics include the full issue list
 * (lead summary + per-issue entries) so UI and model consumers see Zod path/message detail.
 * @category Runtime
 */
export function invokeFailure(
  capabilityId: string,
  code: string,
  message: string,
  validation?: ValidationResult
): InvokeResult {
  return {
    schema: "@executioncontrolprotocol.invoke.result",
    version: LATEST_ECP_VERSION,
    success: false,
    capabilityId: capabilityId as CapabilityId,
    validation,
    diagnostics: buildInvokeFailureDiagnostics(code, message, validation),
  }
}

const HOST_MISSING_CAP_MESSAGE = (id: string) =>
  `Capability ${id} is not in the local host environment. Bind it in environment.ts and restart ecp up --env.`

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "")
}

/**
 * POST `/v1/invoke` to a remote host and return the structured result.
 * @category Runtime
 */
export async function hopRemoteInvoke(
  binding: RemoteInvokeBinding,
  capabilityId: string,
  input: unknown,
  blobs?: Record<string, import("./blobs.js").SerializedCapabilityBlob>
): Promise<InvokeResult> {
  const url = `${trimSlash(binding.url)}/v1/invoke`
  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${binding.token}`,
      },
      body: JSON.stringify({
        capability: capabilityId,
        input: input ?? {},
        ...(blobs && Object.keys(blobs).length > 0 ? { blobs } : {}),
      }),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return invokeFailure(
      capabilityId,
      ECP_INVOKE_ERROR_CODES.INVOKE_FAILED,
      `Local host unreachable (${message}). Is ecp up running?`
    )
  }

  if (res.status === 401) {
    return invokeFailure(
      capabilityId,
      ECP_INVOKE_ERROR_CODES.INVOKE_DENIED,
      "Local host unauthorized — check the pairing token from `ecp up`."
    )
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return invokeFailure(
      capabilityId,
      ECP_INVOKE_ERROR_CODES.INVOKE_FAILED,
      `Local host returned HTTP ${res.status} without an invoke result.`
    )
  }

  if (isInvokeResult(body)) {
    if (
      !body.success &&
      body.diagnostics[0]?.code === ECP_INVOKE_ERROR_CODES.CAPABILITY_NOT_FOUND
    ) {
      return {
        ...body,
        diagnostics: [
          {
            ...body.diagnostics[0],
            message: HOST_MISSING_CAP_MESSAGE(capabilityId),
          },
          ...body.diagnostics.slice(1),
        ],
      }
    }
    return body
  }

  return invokeFailure(
    capabilityId,
    ECP_INVOKE_ERROR_CODES.INVOKE_FAILED,
    `Local host returned HTTP ${res.status} without an invoke result.`
  )
}
