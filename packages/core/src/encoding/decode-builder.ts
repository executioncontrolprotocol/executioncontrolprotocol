import type {
  DecodeResult,
  EcpDecodeOptions,
  EcpSchema,
  EcpVersion,
  NamespacedId,
} from "@executioncontrolprotocol/types"
import { ECP_ENCODING_ERROR_CODES, LATEST_ECP_VERSION, ecpIntentSchema } from "@executioncontrolprotocol/types"
import type { EncodingEnvironmentHost } from "../environment/encoding-host.js"
import { EcpError } from "./errors.js"
import { invokeDecodeCapability } from "./invoke-utility.js"
import { resolveDecoder } from "./resolve.js"
import { createUtilityCapabilityContext } from "./utility-context.js"
import { validateWorkflow } from "../validate/workflow.js"
import { ecpPatchDocumentSchema } from "../patch/patch-document.js"
import { zodIssuesToValidationIssues } from "../validate/zod-mapper.js"
import { emptyValidationResult } from "../validate/workflow-schema.js"

/** Fluent builder for `ecp.decode()`. @category Encoding */
export interface DecodeOperationBuilder {
  uses(extensionId: NamespacedId | string): this
  from(format: string): this
  to(targetSchema: EcpSchema, version?: EcpVersion): this
  with(options: EcpDecodeOptions): this
  strict(enabled?: boolean): this
  process<T = unknown>(): Promise<DecodeResult<T>>
}

interface DecodeState {
  content: unknown
  extensionId?: string
  format?: string
  targetSchema?: EcpSchema
  targetVersion?: EcpVersion
  options: EcpDecodeOptions
}

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

/**
 * Create decode operation builder.
 * @category Encoding
 */
export function createDecodeBuilder(
  env: EncodingEnvironmentHost,
  content: unknown
): DecodeOperationBuilder {
  const state: DecodeState = { content, options: {} }

  const builder: DecodeOperationBuilder = {
    uses(extensionId: NamespacedId | string) {
      state.extensionId = String(extensionId)
      return builder
    },
    from(format: string) {
      state.format = format
      return builder
    },
    to(targetSchema: EcpSchema, version?: EcpVersion) {
      state.targetSchema = targetSchema
      state.targetVersion = version ?? LATEST_ECP_VERSION
      return builder
    },
    with(options: EcpDecodeOptions) {
      state.options = { ...state.options, ...options }
      return builder
    },
    strict(enabled = true) {
      state.options.strict = enabled
      return builder
    },
    async process<T = unknown>(): Promise<DecodeResult<T>> {
      await env.ensureBoundExtensionsRegistered()

      if (!state.extensionId) {
        throw new EcpError(ECP_ENCODING_ERROR_CODES.FORMAT_DECODER_NOT_FOUND, {
          message:
            "Decode requires .uses(formatterId), e.g. .uses(\"@executioncontrolprotocol/format-json\") or .uses(\"@executioncontrolprotocol/format-toon\").",
        })
      }

      const ctx = createUtilityCapabilityContext(
        env.getEnvId(),
        env.getEnvLabel(),
        env.getRegistry()
      )

      const cap = resolveDecoder(env.getRegistry(), state.extensionId)
      const raw = await invokeDecodeCapability(
        cap,
        {
          input: state.content,
          format: state.format,
          targetSchema: state.targetSchema,
          targetVersion: state.targetVersion,
          options: state.options,
        },
        ctx
      )
      let result = raw as DecodeResult<T>
      const target = state.targetSchema ?? result.targetSchema
      if (result.success && result.result !== undefined && target) {
        const validation = validateDecodedDocument(result.result, target)
        result = {
          ...result,
          validation,
          success: result.success && validation.valid,
          diagnostics: [...result.diagnostics, ...validation.errors, ...validation.warnings],
        }
      }

      if (state.options.strict && !result.success) {
        throw new EcpError(ECP_ENCODING_ERROR_CODES.FORMAT_DECODE_FAILED, {
          message: "Decode failed in strict mode.",
          diagnostics: result.diagnostics,
        })
      }

      return result
    },
  }

  return builder
}
