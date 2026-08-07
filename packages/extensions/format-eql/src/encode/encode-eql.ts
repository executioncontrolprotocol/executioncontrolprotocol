import {
  ECP_ENCODING_ERROR_CODES,
  ECP_FORMATS,
  LATEST_ECP_VERSION,
  type EcpIntent,
  type EcpPatchDocument,
  type EncodeResult,
  type EnvironmentDescriptor,
  type EnvironmentManifest,
  type HarnessReply,
  type WorkflowManifest,
} from "@executioncontrolprotocol/types"
import {
  EcpError,
  encodeFailure,
  ecpPatchDocumentSchema,
  validateWorkflow,
  type UtilityCapabilityContext,
} from "@executioncontrolprotocol/core"
import type { EqlEncodeInput } from "../schemas.js"
import { resolveEqlOptions } from "../schemas.js"
import { encodeDescribeToEql } from "./encode-describe.js"
import { encodeEnvironmentToEql } from "./encode-environment.js"
import { encodeIntentToEql } from "./encode-intent.js"
import { encodePatchToEql } from "./encode-patch.js"
import { encodeReplyToEql } from "./encode-reply.js"
import { encodeWorkflowToEql } from "./encode-workflow.js"
import {
  environmentDescribeSchema,
  environmentManifestSchema,
} from "../validate-environment.js"
import { ecpIntentSchema, harnessReplySchema } from "../validate-harness.js"

function getSchema(source: unknown): string | undefined {
  if (source !== null && typeof source === "object" && "schema" in source) {
    const s = (source as { schema: unknown }).schema
    return typeof s === "string" ? s : undefined
  }
  return undefined
}

/**
 * Encode an ECP document to EQL text.
 * @category Encoding
 */
export function encodeToEql(
  input: EqlEncodeInput,
  _ctx: UtilityCapabilityContext
): EncodeResult<string> {
  const sourceSchema = input.sourceSchema ?? getSchema(input.source)
  const opts = resolveEqlOptions(input.options)
  const includeHeader = opts.headers

  if (sourceSchema === "@executioncontrolprotocol.workflow") {
    const manifest = input.source as WorkflowManifest
    const validation = validateWorkflow(manifest)
    if (!validation.valid) {
      return encodeFailure({
        format: ECP_FORMATS.EQL,
        sourceSchema,
        validation,
        diagnostics: [...validation.errors, ...validation.warnings],
      })
    }
    const content = encodeWorkflowToEql(manifest, input.options, includeHeader)
    return {
      schema: "@executioncontrolprotocol.encode.result",
      version: LATEST_ECP_VERSION,
      success: true,
      format: ECP_FORMATS.EQL,
      mediaType: "text/ecp-eql",
      sourceSchema,
      sourceVersion: input.sourceVersion,
      result: content,
      validation,
      diagnostics: [],
    }
  }

  if (sourceSchema === "@executioncontrolprotocol.environment") {
    const manifest = input.source as EnvironmentManifest
    const zod = environmentManifestSchema.safeParse(manifest)
    if (!zod.success) {
      return encodeFailure({
        format: ECP_FORMATS.EQL,
        sourceSchema,
        diagnostics: zod.error.issues.map((i) => ({
          severity: "error" as const,
          message: i.message,
          path: i.path.join("."),
          code: ECP_ENCODING_ERROR_CODES.FORMAT_ENCODE_FAILED,
        })),
      })
    }
    const content = encodeEnvironmentToEql(manifest, input.options, includeHeader)
    return {
      schema: "@executioncontrolprotocol.encode.result",
      version: LATEST_ECP_VERSION,
      success: true,
      format: ECP_FORMATS.EQL,
      mediaType: "text/ecp-eql",
      sourceSchema,
      sourceVersion: input.sourceVersion,
      result: content,
      diagnostics: [],
    }
  }

  if (sourceSchema === "@executioncontrolprotocol.environment.describe") {
    const descriptor = input.source as EnvironmentDescriptor
    const zod = environmentDescribeSchema.safeParse(descriptor)
    if (!zod.success) {
      return encodeFailure({
        format: ECP_FORMATS.EQL,
        sourceSchema,
        diagnostics: zod.error.issues.map((i) => ({
          severity: "error" as const,
          message: i.message,
          path: i.path.join("."),
          code: ECP_ENCODING_ERROR_CODES.FORMAT_ENCODE_FAILED,
        })),
      })
    }
    const content = encodeDescribeToEql(descriptor, input.options, includeHeader)
    return {
      schema: "@executioncontrolprotocol.encode.result",
      version: LATEST_ECP_VERSION,
      success: true,
      format: ECP_FORMATS.EQL,
      mediaType: "text/ecp-eql",
      sourceSchema,
      sourceVersion: input.sourceVersion,
      result: content,
      diagnostics: [],
    }
  }

  if (sourceSchema === "@executioncontrolprotocol.intent") {
    const intent = input.source as EcpIntent
    const zod = ecpIntentSchema.safeParse(intent)
    if (!zod.success) {
      return encodeFailure({
        format: ECP_FORMATS.EQL,
        sourceSchema,
        diagnostics: zod.error.issues.map((i) => ({
          severity: "error" as const,
          message: i.message,
          path: i.path.join("."),
          code: ECP_ENCODING_ERROR_CODES.FORMAT_ENCODE_FAILED,
        })),
      })
    }
    const content = encodeIntentToEql(intent, input.options, includeHeader)
    return {
      schema: "@executioncontrolprotocol.encode.result",
      version: LATEST_ECP_VERSION,
      success: true,
      format: ECP_FORMATS.EQL,
      mediaType: "text/ecp-eql",
      sourceSchema,
      sourceVersion: input.sourceVersion,
      result: content,
      diagnostics: [],
    }
  }

  if (sourceSchema === "@executioncontrolprotocol.harness.reply") {
    const reply = input.source as HarnessReply
    const zod = harnessReplySchema.safeParse(reply)
    if (!zod.success) {
      return encodeFailure({
        format: ECP_FORMATS.EQL,
        sourceSchema,
        diagnostics: zod.error.issues.map((i) => ({
          severity: "error" as const,
          message: i.message,
          path: i.path.join("."),
          code: ECP_ENCODING_ERROR_CODES.FORMAT_ENCODE_FAILED,
        })),
      })
    }
    const content = encodeReplyToEql(reply, input.options, includeHeader)
    return {
      schema: "@executioncontrolprotocol.encode.result",
      version: LATEST_ECP_VERSION,
      success: true,
      format: ECP_FORMATS.EQL,
      mediaType: "text/ecp-eql",
      sourceSchema,
      sourceVersion: input.sourceVersion,
      result: content,
      diagnostics: [],
    }
  }

  if (sourceSchema === "@executioncontrolprotocol.patch") {
    const patch = input.source as EcpPatchDocument
    const zod = ecpPatchDocumentSchema.safeParse(patch)
    if (!zod.success) {
      return encodeFailure({
        format: ECP_FORMATS.EQL,
        sourceSchema,
        diagnostics: zod.error.issues.map((i) => ({
          severity: "error" as const,
          message: i.message,
          path: i.path.join("."),
          code: ECP_ENCODING_ERROR_CODES.FORMAT_ENCODE_FAILED,
        })),
      })
    }
    const workflowIdEntry = patch.patches.find((p) => p.path === "workflow.id")
    const workflowId =
      (typeof workflowIdEntry?.value === "string" ? workflowIdEntry.value : undefined) ??
      "workflow"
    const content = encodePatchToEql(patch, workflowId, input.options, includeHeader)
    return {
      schema: "@executioncontrolprotocol.encode.result",
      version: LATEST_ECP_VERSION,
      success: true,
      format: ECP_FORMATS.EQL,
      mediaType: "text/ecp-eql",
      sourceSchema,
      sourceVersion: input.sourceVersion,
      result: content,
      diagnostics: [],
    }
  }

  throw new EcpError(ECP_ENCODING_ERROR_CODES.FORMAT_UNSUPPORTED_SOURCE_SCHEMA, {
    message: `EQL encode does not support schema: ${sourceSchema ?? "unknown"}`,
  })
}
