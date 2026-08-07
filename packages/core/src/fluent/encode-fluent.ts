import {
  ECP_ENCODING_ERROR_CODES,
  ECP_FORMATS,
  LATEST_ECP_VERSION,
} from "@executioncontrolprotocol/types"
import type {
  EcpFormatOptions,
  EcpSchema,
  EcpVersion,
  EncodeResult,
  WorkflowManifest,
} from "@executioncontrolprotocol/types"
import { encodeFailure } from "../encoding/json-codec.js"
import { validateWorkflow } from "../validate/workflow.js"
import { renderWorkflowToFluent } from "./render-workflow.js"

/**
 * Encode a workflow manifest to Fluent API TypeScript source.
 * @category Fluent
 */
export function encodeFluent(
  source: unknown,
  options: EcpFormatOptions & {
    sourceSchema?: EcpSchema
    sourceVersion?: EcpVersion
  } = {}
): EncodeResult<string> {
  const sourceSchema =
    options.sourceSchema ??
    (source !== null &&
    typeof source === "object" &&
    "schema" in source &&
    typeof (source as { schema: unknown }).schema === "string"
      ? ((source as { schema: string }).schema as EcpSchema)
      : "@executioncontrolprotocol.workflow")

  if (sourceSchema !== "@executioncontrolprotocol.workflow") {
    return encodeFailure({
      format: ECP_FORMATS.FLUENT,
      sourceSchema,
      diagnostics: [
        {
          severity: "error",
          code: ECP_ENCODING_ERROR_CODES.FORMAT_UNSUPPORTED_SOURCE_SCHEMA,
          message: "Fluent encoder only supports @executioncontrolprotocol.workflow.",
        },
      ],
    })
  }

  const manifest = source as WorkflowManifest
  const validation = validateWorkflow(manifest)
  if (!validation.valid) {
    return encodeFailure({
      format: ECP_FORMATS.FLUENT,
      sourceSchema: "@executioncontrolprotocol.workflow",
      validation,
      diagnostics: [...validation.errors, ...validation.warnings],
    })
  }

  const content = renderWorkflowToFluent(manifest, {
    compact: options.compact ?? false,
    importFrom:
      options.importFrom === "@executioncontrolprotocol/browser" || options.target === "browser"
        ? "@executioncontrolprotocol/browser"
        : "@executioncontrolprotocol/core",
  })

  return {
    schema: "@executioncontrolprotocol.encode.result",
    version: LATEST_ECP_VERSION,
    success: true,
    format: ECP_FORMATS.FLUENT,
    mediaType: "text/typescript",
    sourceSchema: "@executioncontrolprotocol.workflow",
    sourceVersion: options.sourceVersion,
    result: content,
    diagnostics: [],
  }
}
