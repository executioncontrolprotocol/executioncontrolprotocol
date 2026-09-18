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
  .withMetadata({
    summary: "Canonical JSON encode and decode for ECP documents.",
    description:
      "Passthrough JSON serialization and parsing with optional target validation for workflows, patches, and intent documents.",
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/format-json", "encode")
      .withInput(ecpEncodeInputSchema)
      .withOutput(ecpEncodeResultSchema)
      .withMetadata({
        summary: "Serialize an ECP document to JSON text.",
        description:
          "Encodes a source document as formatted JSON. Used when no specialized format is selected or for canonical manifest export.",
        useCases: [
          "CLI writes a compiled workflow manifest to disk.",
          "API returns a JSON snapshot of the current document.",
        ],
        samplePrompts: [
          "Export this workflow as JSON.",
          "Encode the manifest to pretty-printed JSON.",
        ],
      })
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
      .withMetadata({
        summary: "Parse JSON text into an ECP document.",
        description:
          "Parses JSON input and optionally validates against a target document type. Returns validation diagnostics when the parsed object fails checks.",
        useCases: [
          "Loader imports a workflow.json file into the editor.",
          "Patch step parses JSON model output before applying changes.",
        ],
        samplePrompts: [
          "Decode this JSON file into a workflow manifest.",
          "Parse the JSON patch document from the model.",
        ],
      })
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
