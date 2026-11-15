import {
  ECP_INPUT_INVALID,
  EcpError,
  isEcpError,
} from "@executioncontrolprotocol/core/types"
import {
  failureEnvelope,
  successEnvelope,
  type EcpErrorBody,
} from "@executioncontrolprotocol/plugin-sdk"

/**
 * MCP tool result with a JSON text payload.
 * @category MCP
 */
export interface McpToolTextResult {
  /** MCP SDK result bags are open-ended. */
  [key: string]: unknown
  /** True when the tool failed. */
  isError?: boolean
  /** Text content blocks. */
  content: Array<{ type: "text"; text: string }>
}

function textResult(value: unknown, isError = false): McpToolTextResult {
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  }
}

/**
 * Wrap a successful tool payload in the CLI `{ ok, data }` envelope.
 * @category MCP
 */
export function toolOk(data: unknown): McpToolTextResult {
  return textResult(successEnvelope(data))
}

/**
 * Wrap a structured error in the CLI `{ ok: false, error }` envelope.
 * @category MCP
 */
export function toolFail(error: EcpErrorBody): McpToolTextResult {
  return textResult(failureEnvelope(error), true)
}

function errorBody(err: unknown): EcpErrorBody {
  if (isEcpError(err) || err instanceof EcpError) {
    return {
      code: err.code,
      message: err.message,
      ...(err.path !== undefined ? { path: err.path } : {}),
      ...(err.suggestions !== undefined ? { suggestions: err.suggestions } : {}),
      ...(err.details !== undefined ? { details: err.details } : {}),
    }
  }
  if (err instanceof Error) {
    return { code: ECP_INPUT_INVALID, message: err.message }
  }
  return { code: ECP_INPUT_INVALID, message: String(err) }
}

/**
 * Convert a thrown value into an MCP tool error result.
 * @category MCP
 */
export function toolCaught(err: unknown): McpToolTextResult {
  return toolFail(errorBody(err))
}

/**
 * JSON contents for an MCP resource.
 * @category MCP
 */
export function jsonContents(uri: URL, value: unknown, mimeType: string) {
  return {
    contents: [{ uri: uri.href, mimeType, text: JSON.stringify(value, null, 2) }],
  }
}
