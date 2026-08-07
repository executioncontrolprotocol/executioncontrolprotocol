import {
  ECP_ENCODING_ERROR_CODES,
  LATEST_ECP_VERSION,
  type DecodeResult,
  type EcpSchema,
} from "@executioncontrolprotocol/types"
import { decodeFailure, ecpPatchDocumentSchema, validateWorkflow, type UtilityCapabilityContext } from "@executioncontrolprotocol/core"
import type { EqlDecodeInput } from "../schemas.js"
import { EQL_ERROR_CODES, eqlIssue } from "./diagnostics.js"
import { detectHeader, parseEql } from "./parser.js"
import { describeFromEql } from "./normalize-describe.js"
import { environmentFromEql } from "./normalize-environment.js"
import { intentFromEql } from "./normalize-intent.js"
import { patchFromEql } from "./normalize-patch.js"
import { replyFromEql } from "./normalize-reply.js"
import { workflowFromEql } from "./normalize-workflow.js"
import {
  environmentDescribeSchema,
  environmentManifestSchema,
} from "../validate-environment.js"
import { ecpIntentSchema, harnessReplySchema } from "../validate-harness.js"

/**
 * Decode EQL text to an ECP document.
 * @category Encoding
 */
export function decodeFromEql(
  input: EqlDecodeInput,
  _ctx: UtilityCapabilityContext
): DecodeResult {
  const content = String(input.input ?? "")
  const headersOpt = input.options?.headers ?? "auto"
  const detected = detectHeader(content)
  const hasHeader =
    headersOpt === true ||
    (headersOpt === "auto" && detected !== undefined)

  let targetSchema = input.targetSchema as EcpSchema | undefined
  if (hasHeader && detected) {
    if (targetSchema && targetSchema !== detected.schema) {
      return decodeFailure({
        targetSchema,
        diagnostics: [
          eqlIssue(
            EQL_ERROR_CODES.UNSUPPORTED_SCHEMA,
            `EQL header schema ${detected.schema} does not match targetSchema ${targetSchema}`
          ),
        ],
      })
    }
    targetSchema = detected.schema as EcpSchema
  }

  if (!targetSchema) {
    return decodeFailure({
      targetSchema: input.targetSchema,
      diagnostics: [
        eqlIssue(
          EQL_ERROR_CODES.MISSING_TARGET_SCHEMA,
          "Decode requires an ECP header or explicit targetSchema",
          "line:1"
        ),
      ],
    })
  }

  const supportedDecodeSchemas = [
    "@executioncontrolprotocol.workflow",
    "@executioncontrolprotocol.patch",
    "@executioncontrolprotocol.environment",
    "@executioncontrolprotocol.environment.describe",
    "@executioncontrolprotocol.intent",
    "@executioncontrolprotocol.harness.reply",
  ] as const
  if (!supportedDecodeSchemas.includes(targetSchema as (typeof supportedDecodeSchemas)[number])) {
    return decodeFailure({
      targetSchema,
      diagnostics: [
        eqlIssue(
          EQL_ERROR_CODES.UNSUPPORTED_SCHEMA,
          `EQL decode does not support schema: ${targetSchema}`
        ),
      ],
    })
  }

  const parsed = parseEql(content)
  if (parsed.issues.length > 0) {
    return decodeFailure({
      targetSchema,
      diagnostics: parsed.issues,
    })
  }

  if (!parsed.document) {
    return decodeFailure({
      targetSchema,
      diagnostics: [eqlIssue(EQL_ERROR_CODES.SYNTAX, "Failed to parse EQL document")],
    })
  }

  try {
    if (parsed.document.kind === "environment") {
      if (targetSchema !== "@executioncontrolprotocol.environment") {
        return decodeFailure({
          targetSchema,
          diagnostics: [
            eqlIssue(
              EQL_ERROR_CODES.UNSUPPORTED_SCHEMA,
              "EQL environment document does not match targetSchema"
            ),
          ],
        })
      }
      const manifest = environmentFromEql(parsed.document)
      const zod = environmentManifestSchema.safeParse(manifest)
      if (!zod.success) {
        return decodeFailure({
          targetSchema,
          diagnostics: zod.error.issues.map((i) => ({
            severity: "error" as const,
            message: i.message,
            path: i.path.join("."),
            code: ECP_ENCODING_ERROR_CODES.FORMAT_DECODE_FAILED,
          })),
        })
      }
      return {
        schema: "@executioncontrolprotocol.decode.result",
        version: LATEST_ECP_VERSION,
        success: true,
        targetSchema,
        result: manifest,
        diagnostics: [],
      }
    }

    if (parsed.document.kind === "describe") {
      if (targetSchema !== "@executioncontrolprotocol.environment.describe") {
        return decodeFailure({
          targetSchema,
          diagnostics: [
            eqlIssue(
              EQL_ERROR_CODES.UNSUPPORTED_SCHEMA,
              "EQL describe document does not match targetSchema"
            ),
          ],
        })
      }
      const descriptor = describeFromEql(parsed.document)
      const zod = environmentDescribeSchema.safeParse(descriptor)
      if (!zod.success) {
        return decodeFailure({
          targetSchema,
          diagnostics: zod.error.issues.map((i) => ({
            severity: "error" as const,
            message: i.message,
            path: i.path.join("."),
            code: ECP_ENCODING_ERROR_CODES.FORMAT_DECODE_FAILED,
          })),
        })
      }
      return {
        schema: "@executioncontrolprotocol.decode.result",
        version: LATEST_ECP_VERSION,
        success: true,
        targetSchema,
        result: descriptor,
        diagnostics: [],
      }
    }

    if (parsed.document.kind === "intent") {
      if (targetSchema !== "@executioncontrolprotocol.intent") {
        return decodeFailure({
          targetSchema,
          diagnostics: [
            eqlIssue(
              EQL_ERROR_CODES.UNSUPPORTED_SCHEMA,
              "EQL intent document does not match targetSchema"
            ),
          ],
        })
      }
      const intent = intentFromEql(parsed.document)
      const zod = ecpIntentSchema.safeParse(intent)
      if (!zod.success) {
        return decodeFailure({
          targetSchema,
          diagnostics: zod.error.issues.map((i) => ({
            severity: "error" as const,
            message: i.message,
            path: i.path.join("."),
            code: ECP_ENCODING_ERROR_CODES.FORMAT_DECODE_FAILED,
          })),
        })
      }
      return {
        schema: "@executioncontrolprotocol.decode.result",
        version: LATEST_ECP_VERSION,
        success: true,
        targetSchema,
        result: intent,
        diagnostics: [],
      }
    }

    if (parsed.document.kind === "reply") {
      if (targetSchema !== "@executioncontrolprotocol.harness.reply") {
        return decodeFailure({
          targetSchema,
          diagnostics: [
            eqlIssue(
              EQL_ERROR_CODES.UNSUPPORTED_SCHEMA,
              "EQL reply document does not match targetSchema"
            ),
          ],
        })
      }
      const reply = replyFromEql(parsed.document)
      const zod = harnessReplySchema.safeParse(reply)
      if (!zod.success) {
        return decodeFailure({
          targetSchema,
          diagnostics: zod.error.issues.map((i) => ({
            severity: "error" as const,
            message: i.message,
            path: i.path.join("."),
            code: ECP_ENCODING_ERROR_CODES.FORMAT_DECODE_FAILED,
          })),
        })
      }
      return {
        schema: "@executioncontrolprotocol.decode.result",
        version: LATEST_ECP_VERSION,
        success: true,
        targetSchema,
        result: reply,
        diagnostics: [],
      }
    }

    if (parsed.document.kind === "workflow") {
      if (targetSchema !== "@executioncontrolprotocol.workflow") {
        return decodeFailure({
          targetSchema,
          diagnostics: [
            eqlIssue(
              EQL_ERROR_CODES.UNSUPPORTED_SCHEMA,
              "EQL workflow document does not match targetSchema"
            ),
          ],
        })
      }
      const manifest = workflowFromEql(parsed.document)
      const validation = validateWorkflow(manifest)
      return {
        schema: "@executioncontrolprotocol.decode.result",
        version: LATEST_ECP_VERSION,
        success: validation.valid,
        targetSchema,
        result: manifest,
        validation,
        diagnostics: validation.valid
          ? []
          : [...validation.errors, ...validation.warnings],
      }
    }

    if (targetSchema !== "@executioncontrolprotocol.patch") {
      return decodeFailure({
        targetSchema,
        diagnostics: [
          eqlIssue(
            EQL_ERROR_CODES.UNSUPPORTED_SCHEMA,
            "EQL patch document does not match targetSchema"
          ),
        ],
      })
    }

    const patchDoc = patchFromEql(parsed.document)
    const zod = ecpPatchDocumentSchema.safeParse(patchDoc)
    if (!zod.success) {
      return decodeFailure({
        targetSchema,
        diagnostics: zod.error.issues.map((i) => ({
          severity: "error" as const,
          message: i.message,
          path: i.path.join("."),
          code: ECP_ENCODING_ERROR_CODES.FORMAT_DECODE_FAILED,
        })),
      })
    }

    return {
      schema: "@executioncontrolprotocol.decode.result",
      version: LATEST_ECP_VERSION,
      success: true,
      targetSchema,
      result: patchDoc,
      diagnostics: [],
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return decodeFailure({
      targetSchema,
      diagnostics: [
        eqlIssue(ECP_ENCODING_ERROR_CODES.FORMAT_DECODE_FAILED, message),
      ],
    })
  }
}
