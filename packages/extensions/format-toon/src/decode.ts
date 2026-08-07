import {
  ECP_ENCODING_ERROR_CODES,
  LATEST_ECP_VERSION,
} from "@executioncontrolprotocol/types"
import type { DecodeResult, EcpDecodeInput, EcpSchema } from "@executioncontrolprotocol/types"
import { EcpError, decodeFailure, validateWorkflow, type UtilityCapabilityContext } from "@executioncontrolprotocol/core"
import { decodeDocumentFromToon } from "./toon-codec.js"
import { validateEcpDocument, validationToDiagnostics } from "./validate-document.js"
import { getEcpSchema } from "./schema.js"

function wrapHeaderless(
  document: unknown,
  targetSchema: EcpSchema
): Record<string, unknown> {
  if (document !== null && typeof document === "object" && "schema" in document) {
    return document as Record<string, unknown>
  }
  return {
    schema: targetSchema,
    version: LATEST_ECP_VERSION,
    ...(document as Record<string, unknown>),
  }
}

/**
 * Decode TOON text to an ECP document via `@toon-format/toon`.
 * @category Encoding
 */
export function decodeFromToon(
  input: EcpDecodeInput,
  _ctx: UtilityCapabilityContext
): DecodeResult {
  const targetSchema = input.targetSchema ?? "@executioncontrolprotocol.workflow"
  const content = String(input.input)
  const headersOpt = input.options?.headers ?? "auto"
  const hasHeaders =
    headersOpt === true || (headersOpt === "auto" && /^\s*schema\s*:/m.test(content))

  let document: unknown
  try {
    document = decodeDocumentFromToon(content, {
      strict: input.options?.strict ?? true,
      compact: input.options?.compact ?? false,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return decodeFailure({
      targetSchema,
      diagnostics: [
        {
          severity: "error",
          code: ECP_ENCODING_ERROR_CODES.FORMAT_DECODE_FAILED,
          message: `TOON decode failed: ${message}`,
        },
      ],
    })
  }

  if (!hasHeaders) {
    document = wrapHeaderless(document, targetSchema)
  }

  let validation = validateEcpDocument(document, targetSchema)
  if (targetSchema === "@executioncontrolprotocol.workflow") {
    validation = validateWorkflow(document as import("@executioncontrolprotocol/types").WorkflowManifest)
  }

  const diagnostics = validationToDiagnostics(validation)
  const success = validation.valid

  if (!success && input.options?.strict) {
    throw new EcpError(ECP_ENCODING_ERROR_CODES.FORMAT_DECODE_FAILED, {
      message: `Decoded document failed validation for ${targetSchema}.`,
      diagnostics: validation.errors,
    })
  }

  return {
    schema: "@executioncontrolprotocol.decode.result",
    version: LATEST_ECP_VERSION,
    success,
    targetSchema: getEcpSchema(document) ?? targetSchema,
    targetVersion: input.targetVersion,
    result: document,
    validation,
    diagnostics: [...diagnostics, ...validation.errors, ...validation.warnings],
  }
}

/** @deprecated Use {@link decodeFromToon}. @category Encoding */
export const decodeToonToWorkflow = decodeFromToon
