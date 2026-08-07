import type { EcpSchema } from "./schema.js"
import type { EcpVersion } from "./version.js"
import type { ValidationIssue } from "./validation.js"
import type { ValidationResult } from "./validation.js"

/** Reserved capability names for format extensions. @category Encoding */
export const ECP_FORMAT_CAPABILITY_NAMES = {
  ENCODE: "encode",
  DECODE: "decode",
} as const

/** Known format identifiers. @category Encoding */
export const ECP_FORMATS = {
  JSON: "json",
  TOON: "toon",
  FLUENT: "fluent",
  EQL: "eql",
} as const

/** Encoding error codes. @category Encoding */
export const ECP_ENCODING_ERROR_CODES = {
  FORMAT_EXTENSION_NOT_FOUND: "FORMAT_EXTENSION_NOT_FOUND",
  FORMAT_ENCODER_NOT_FOUND: "FORMAT_ENCODER_NOT_FOUND",
  FORMAT_DECODER_NOT_FOUND: "FORMAT_DECODER_NOT_FOUND",
  FORMAT_ENCODER_INVALID_CONTRACT: "FORMAT_ENCODER_INVALID_CONTRACT",
  FORMAT_DECODER_INVALID_CONTRACT: "FORMAT_DECODER_INVALID_CONTRACT",
  FORMAT_ENCODE_FAILED: "FORMAT_ENCODE_FAILED",
  FORMAT_DECODE_FAILED: "FORMAT_DECODE_FAILED",
  FORMAT_UNSUPPORTED_SOURCE_SCHEMA: "FORMAT_UNSUPPORTED_SOURCE_SCHEMA",
  FORMAT_UNSUPPORTED_TARGET_SCHEMA: "FORMAT_UNSUPPORTED_TARGET_SCHEMA",
} as const

/** Encoding error code union. @category Encoding */
export type EcpEncodingErrorCode =
  (typeof ECP_ENCODING_ERROR_CODES)[keyof typeof ECP_ENCODING_ERROR_CODES]

/** Standard format encoder options. @category Encoding */
export interface EcpFormatOptions extends Record<string, unknown> {
  /** Include schema/version headers in encoded output. Default true. */
  headers?: boolean
  /** Prefer compact output. Default false. */
  compact?: boolean
  /** Return string content instead of object (JSON codec). */
  as?: "object" | "string"
  /** Fields to include when supported by the encoder. */
  include?: string[]
}

/** Standard format decoder options. @category Encoding */
export interface EcpDecodeOptions extends Record<string, unknown> {
  /** Fail on invalid syntax or schema mismatch. */
  strict?: boolean
  /** Header expectation. Default `"auto"`. */
  headers?: boolean | "auto"
  /** Match compact TOON encoding (`keyFolding: safe`). Default false. */
  compact?: boolean
}

/** Encode operation result. @category Encoding */
export interface EncodeResult<T = unknown> {
  schema: "@executioncontrolprotocol.encode.result"
  version: EcpVersion
  success: boolean
  format: string
  sourceSchema?: EcpSchema
  sourceVersion?: EcpVersion
  mediaType?: string
  result?: T
  validation?: ValidationResult
  diagnostics: ValidationIssue[]
}

/** Decode operation result. @category Encoding */
export interface DecodeResult<T = unknown> {
  schema: "@executioncontrolprotocol.decode.result"
  version: EcpVersion
  success: boolean
  targetSchema?: EcpSchema
  targetVersion?: EcpVersion
  result?: T
  validation?: ValidationResult
  diagnostics: ValidationIssue[]
}

/** Concrete encode result for schema generation. @category Encoding */
export type EncodeResultDocument = EncodeResult<unknown>

/** Concrete decode result for schema generation. @category Encoding */
export type DecodeResultDocument = DecodeResult<unknown>

/** Minimum encode capability contract. Extensions intersect `TOptions`. @category Encoding */
export interface EncodeCapabilityInput<
  TValue = unknown,
  TOptions extends Record<string, unknown> = EcpFormatOptions,
> {
  source: TValue
  sourceSchema?: EcpSchema
  sourceVersion?: EcpVersion
  format?: string
  options?: TOptions
}

/** Minimum decode capability contract. @category Encoding */
export interface DecodeCapabilityInput<
  TOptions extends Record<string, unknown> = EcpDecodeOptions,
> {
  input: unknown
  format?: string
  targetSchema?: EcpSchema
  targetVersion?: EcpVersion
  options?: TOptions
}

/** Input to `{extensionId}.encode` capabilities. @category Encoding */
export type EcpEncodeInput = EncodeCapabilityInput

/** Input to `{extensionId}.decode` capabilities. @category Encoding */
export type EcpDecodeInput = DecodeCapabilityInput
