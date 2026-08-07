import {
  ECP_ENCODING_ERROR_CODES,
  ECP_FORMATS,
  LATEST_ECP_VERSION,
} from "@executioncontrolprotocol/types"
import type { EcpEncodeInput, EncodeResult } from "@executioncontrolprotocol/types"
import { EcpError, encodeFailure, validateWorkflow, type UtilityCapabilityContext } from "@executioncontrolprotocol/core"
import { encodeDocumentToToon } from "./toon-codec.js"
import { validateEcpDocument, validationToDiagnostics } from "./validate-document.js"

function stripDocumentHeaders(doc: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...doc }
  delete rest.schema
  delete rest.version
  return rest
}

/**
 * Encode document to TOON via `@toon-format/toon`.
 * @category Encoding
 */
export function encodeToToon(
  input: EcpEncodeInput,
  _ctx: UtilityCapabilityContext
): EncodeResult<string> {
  const sourceSchema = input.sourceSchema
  const validation = validateEcpDocument(input.source, sourceSchema)
  const diagnostics = validationToDiagnostics(validation)

  if (sourceSchema === "@executioncontrolprotocol.workflow") {
    const wfValidation = validateWorkflow(input.source as import("@executioncontrolprotocol/types").WorkflowManifest)
    if (!wfValidation.valid) {
      return encodeFailure({
        format: ECP_FORMATS.TOON,
        sourceSchema,
        validation: wfValidation,
        diagnostics: [...diagnostics, ...wfValidation.errors, ...wfValidation.warnings],
      })
    }
  }

  const headers = input.options?.headers !== false
  const compact = input.options?.compact ?? false

  try {
    let payload = input.source
    if (!headers && payload !== null && typeof payload === "object") {
      payload = stripDocumentHeaders(payload as Record<string, unknown>)
    }
    const content = encodeDocumentToToon(payload, { compact })

    return {
      schema: "@executioncontrolprotocol.encode.result",
      version: LATEST_ECP_VERSION,
      success: true,
      format: ECP_FORMATS.TOON,
      mediaType: "text/ecp-toon",
      sourceSchema,
      sourceVersion: input.sourceVersion,
      result: content,
      diagnostics,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new EcpError(ECP_ENCODING_ERROR_CODES.FORMAT_ENCODE_FAILED, {
      message: `TOON encode failed: ${message}`,
    })
  }
}

/** @deprecated Use {@link encodeToToon}. @category Encoding */
export const encodeWorkflowToToon = encodeToToon
