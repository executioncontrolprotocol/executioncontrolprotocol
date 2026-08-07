import {
  catalogExtension,
  capabilityFor,
  defineExtension,
  ecpEncodeInputSchema,
  ecpEncodeResultSchema,
  encodeFailure,
  validateWorkflow,
} from "@executioncontrolprotocol/core"
import { LATEST_ECP_VERSION, type EcpEncodeInput, type EncodeResult } from "@executioncontrolprotocol/types"
import type { WorkflowManifest } from "@executioncontrolprotocol/types"
import { workflowToMermaid } from "./workflow-to-mermaid.js"
import { type MermaidEncodeOptions } from "./options.js"

function encodeToMermaid(input: EcpEncodeInput): EncodeResult<string> {
  const sourceSchema = input.sourceSchema
  if (sourceSchema !== "@executioncontrolprotocol.workflow") {
    return encodeFailure({
      format: "mermaid",
      sourceSchema,
      diagnostics: [
        {
          severity: "error",
          code: "FORMAT_UNSUPPORTED_SOURCE_SCHEMA",
          message: "Mermaid encoder supports @executioncontrolprotocol.workflow only",
        },
      ],
    })
  }

  const validation = validateWorkflow(input.source as WorkflowManifest)
  if (!validation.valid) {
    return encodeFailure({
      format: "mermaid",
      sourceSchema,
      validation,
      diagnostics: [...validation.errors, ...validation.warnings],
    })
  }

  return {
    schema: "@executioncontrolprotocol.encode.result",
    version: LATEST_ECP_VERSION,
    success: true,
    format: "mermaid",
    mediaType: "text/vnd.mermaid",
    sourceSchema,
    sourceVersion: input.sourceVersion,
    result: workflowToMermaid(input.source as WorkflowManifest, input.options as MermaidEncodeOptions),
    diagnostics: [],
  }
}

/** Mermaid format extension (encode-only). @category Extensions */
export const formatMermaidExtension = defineExtension("@executioncontrolprotocol", "format-mermaid")
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/format-mermaid", "encode")
      .withInput(ecpEncodeInputSchema)
      .withOutput(ecpEncodeResultSchema)
      .withHandler((input) => encodeToMermaid(input as EcpEncodeInput)),
  ])
  .build()

catalogExtension(formatMermaidExtension)
