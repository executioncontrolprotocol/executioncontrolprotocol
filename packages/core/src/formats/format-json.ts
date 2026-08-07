import { capabilityFor, defineExtension } from "../definitions/index.js"
import {
  ecpDecodeInputSchema,
  ecpDecodeResultSchema,
  ecpEncodeInputSchema,
  ecpEncodeResultSchema,
} from "../encoding/schemas.js"
import { decodeJson, encodeJson } from "../encoding/json-codec.js"
import type { EcpDecodeInput, EcpEncodeInput, EcpSchema } from "@executioncontrolprotocol/types"
import { ecpIntentSchema } from "@executioncontrolprotocol/types"
import { validateWorkflow } from "../validate/workflow.js"
import { ecpPatchDocumentSchema } from "../patch/patch-document.js"
import { emptyValidationResult } from "../validate/workflow-schema.js"
import { zodIssuesToValidationIssues } from "../validate/zod-mapper.js"

function validateDecodedDocument(
  document: unknown,
  targetSchema?: EcpSchema
): import("@executioncontrolprotocol/types").ValidationResult {
  if (targetSchema === "@executioncontrolprotocol.workflow") {
    return validateWorkflow(document as import("@executioncontrolprotocol/types").WorkflowManifest)
  }
  if (targetSchema === "@executioncontrolprotocol.patch") {
    const parsed = ecpPatchDocumentSchema.safeParse(document)
    if (parsed.success) return emptyValidationResult(true)
    const result = emptyValidationResult(false)
    result.errors.push(...zodIssuesToValidationIssues(parsed.error.issues))
    return result
  }
  if (targetSchema === "@executioncontrolprotocol.intent") {
    const parsed = ecpIntentSchema.safeParse(document)
    if (parsed.success) return emptyValidationResult(true)
    const result = emptyValidationResult(false)
    result.errors.push(...zodIssuesToValidationIssues(parsed.error.issues))
    return result
  }
  return emptyValidationResult(true)
}

/** Core JSON format extension. @category Formats */
export const formatJsonExtension = defineExtension("@executioncontrolprotocol", "format-json")
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/format-json", "encode")
      .withInput(ecpEncodeInputSchema)
      .withOutput(ecpEncodeResultSchema)
      .withHandler((input) =>
        encodeJson((input as EcpEncodeInput).source, {
          ...(input as EcpEncodeInput).options,
          sourceSchema: (input as EcpEncodeInput).sourceSchema,
          sourceVersion: (input as EcpEncodeInput).sourceVersion,
        })
      ),
    capabilityFor("@executioncontrolprotocol/format-json", "decode")
      .withInput(ecpDecodeInputSchema)
      .withOutput(ecpDecodeResultSchema)
      .withHandler((input) => {
        const decoded = input as EcpDecodeInput
        const target = decoded.targetSchema
        const parsed = decodeJson(decoded.input, {
          targetSchema: target,
          targetVersion: decoded.targetVersion,
          ...decoded.options,
        })
        if (!parsed.success || parsed.result === undefined) {
          return parsed
        }
        const validation = target
          ? validateDecodedDocument(parsed.result, target)
          : emptyValidationResult(true)
        const success = validation.valid
        return {
          ...parsed,
          validation,
          success,
          diagnostics: [
            ...parsed.diagnostics,
            ...validation.errors,
            ...validation.warnings,
          ],
        }
      }),
  ])
  .build()
