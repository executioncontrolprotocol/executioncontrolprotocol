import type { EncodeResult, EcpFormatOptions, EcpSchema, EcpVersion, NamespacedId } from "@executioncontrolprotocol/types"
import { ECP_ENCODING_ERROR_CODES, LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"
import type { EncodingEnvironmentHost } from "../environment/encoding-host.js"
import { encodeFailure, getEcpSchema } from "./json-codec.js"
import { EcpError } from "./errors.js"
import { invokeEncodeCapability } from "./invoke-utility.js"
import { resolveEncoder } from "./resolve.js"
import { createUtilityCapabilityContext } from "./utility-context.js"
import { validateWorkflow } from "../validate/workflow.js"

/** Fluent builder for `ecp.encode()`. @category Encoding */
export interface EncodeOperationBuilder {
  uses(extensionId: NamespacedId | string): this
  to(schema: EcpSchema, version?: EcpVersion): this
  with(options: EcpFormatOptions): this
  compact(enabled?: boolean): this
  asString(): this
  asObject(): this
  include(fields: string[]): this
  process<T = unknown>(): Promise<EncodeResult<T>>
}

interface EncodeState {
  source: unknown
  extensionId?: string
  targetSchema?: EcpSchema
  targetVersion?: EcpVersion
  options: EcpFormatOptions
}

/**
 * Create encode operation builder.
 * @category Encoding
 */
export function createEncodeBuilder(
  env: EncodingEnvironmentHost,
  source: unknown
): EncodeOperationBuilder {
  const state: EncodeState = { source, options: {} }

  const builder: EncodeOperationBuilder = {
    uses(extensionId: NamespacedId | string) {
      state.extensionId = String(extensionId)
      return builder
    },
    to(schema: EcpSchema, version?: EcpVersion) {
      state.targetSchema = schema
      state.targetVersion = version ?? LATEST_ECP_VERSION
      return builder
    },
    with(options: EcpFormatOptions) {
      state.options = { ...state.options, ...options }
      return builder
    },
    compact(enabled = true) {
      state.options.compact = enabled
      return builder
    },
    asString() {
      state.options.as = "string"
      return builder
    },
    asObject() {
      state.options.as = "object"
      return builder
    },
    include(fields: string[]) {
      state.options.include = fields
      return builder
    },
    async process<T = unknown>(): Promise<EncodeResult<T>> {
      await env.ensureBoundExtensionsRegistered()

      if (!state.extensionId) {
        throw new EcpError(ECP_ENCODING_ERROR_CODES.FORMAT_ENCODER_NOT_FOUND, {
          message:
            "Encode requires .uses(formatterId), e.g. .uses(\"@executioncontrolprotocol/format-json\") or .uses(\"@executioncontrolprotocol/format-fluent\").",
        })
      }

      const sourceSchema = state.targetSchema ?? getEcpSchema(state.source)
      const ctx = createUtilityCapabilityContext(
        env.getEnvId(),
        env.getEnvLabel(),
        env.getRegistry()
      )

      if (sourceSchema === "@executioncontrolprotocol.workflow") {
        const validation = validateWorkflow(
          state.source as import("@executioncontrolprotocol/types").WorkflowManifest
        )
        if (!validation.valid) {
          return encodeFailure({
            format: "json",
            sourceSchema,
            validation,
            diagnostics: [...validation.errors, ...validation.warnings],
          }) as EncodeResult<T>
        }
      }

      const cap = resolveEncoder(env.getRegistry(), state.extensionId)
      const result = await invokeEncodeCapability(
        cap,
        {
          source: state.source,
          sourceSchema,
          sourceVersion: state.targetVersion,
          options: state.options,
        },
        ctx
      )
      return result as EncodeResult<T>
    },
  }

  return builder
}
