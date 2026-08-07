import { ECP_FORMATS, LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"
import type {
  DecodeResult,
  EcpFormatOptions,
  EcpDecodeOptions,
  EcpSchema,
  EcpVersion,
  EncodeResult,
  ValidationResult,
} from "@executioncontrolprotocol/types"
import { emptyValidationResult } from "../validate/workflow-schema.js"

/**
 * Infer ECP schema from a document object.
 * @category Encoding
 */
export function getEcpSchema(value: unknown): EcpSchema | undefined {
  if (value !== null && typeof value === "object" && "schema" in value) {
    const s = (value as { schema: unknown }).schema
    if (typeof s === "string") return s as EcpSchema
  }
  return undefined
}

function failureDiagnostics(validation?: ValidationResult) {
  return validation ? [...validation.errors, ...validation.warnings] : []
}

/**
 * Encode a document as canonical JSON.
 * @category Encoding
 */
export function encodeJson(
  input: unknown,
  options: EcpFormatOptions & { sourceSchema?: EcpSchema; sourceVersion?: string } = {}
): EncodeResult {
  const sourceSchema = options.sourceSchema ?? getEcpSchema(input)
  const compact = options.compact ?? false
  const validation = emptyValidationResult(true)

  const resultPayload =
    options.as === "string"
      ? JSON.stringify(input, null, compact ? 0 : 2)
      : input

  return {
    schema: "@executioncontrolprotocol.encode.result",
    version: LATEST_ECP_VERSION,
    success: true,
    format: ECP_FORMATS.JSON,
    mediaType: "application/ecp+json",
    sourceSchema,
    sourceVersion: options.sourceVersion as EcpVersion | undefined,
    result: resultPayload,
    validation,
    diagnostics: failureDiagnostics(validation),
  }
}

/**
 * Build a failed encode result envelope.
 * @category Encoding
 */
export function encodeFailure<T = unknown>(
  partial: Partial<EncodeResult<T>> & { diagnostics: EncodeResult["diagnostics"] }
): EncodeResult<T> {
  return {
    schema: "@executioncontrolprotocol.encode.result",
    version: LATEST_ECP_VERSION,
    success: false,
    format: partial.format ?? ECP_FORMATS.JSON,
    ...partial,
    diagnostics: partial.diagnostics,
  } as EncodeResult<T>
}

/**
 * Decode JSON text or object to a document.
 * @category Encoding
 */
export function decodeJson<T = unknown>(
  input: unknown,
  options: EcpDecodeOptions & {
    targetSchema?: EcpSchema
    targetVersion?: string
    validation?: ValidationResult
  } = {}
): DecodeResult<T> {
  let document: T
  try {
    document =
      typeof input === "string" ? (JSON.parse(input) as T) : (input as T)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      schema: "@executioncontrolprotocol.decode.result",
      version: LATEST_ECP_VERSION,
      success: false,
      targetSchema: options.targetSchema,
      diagnostics: [
        {
          severity: "error",
          message: `JSON parse failed: ${message}`,
          code: "FORMAT_DECODE_FAILED",
        },
      ],
    }
  }

  const validation = options.validation ?? emptyValidationResult(true)
  const success = validation.valid

  return {
    schema: "@executioncontrolprotocol.decode.result",
    version: LATEST_ECP_VERSION,
    success,
    targetSchema: options.targetSchema ?? getEcpSchema(document),
    targetVersion: options.targetVersion as EcpVersion | undefined,
    result: document,
    validation,
    diagnostics: failureDiagnostics(validation),
  }
}

/**
 * Build a failed decode result envelope.
 * @category Encoding
 */
export function decodeFailure(
  partial: Partial<DecodeResult> & { diagnostics: DecodeResult["diagnostics"] }
): DecodeResult {
  return {
    schema: "@executioncontrolprotocol.decode.result",
    version: LATEST_ECP_VERSION,
    success: false,
    ...partial,
    diagnostics: partial.diagnostics,
  }
}
