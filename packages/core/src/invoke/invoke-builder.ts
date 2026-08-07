import type { CapabilityId, InvokeResult } from "@executioncontrolprotocol/types"
import type { Environment } from "../environment/environment.js"
import { executeInvoke } from "./execute-invoke.js"

/** Fluent builder for `ecp.invoke()`. @category Invoke */
export interface InvokeOperationBuilder {
  /** Capability input payload. */
  with(input: unknown): this
  /** Override harness default provider capability. */
  uses(providerCapabilityId: CapabilityId | string): this
  /** Run the invocation. */
  process<T = unknown>(): Promise<InvokeResult<T>>
}

/**
 * Create invoke operation builder.
 * @category Invoke
 */
export function createInvokeBuilder(
  env: Environment,
  capabilityId: CapabilityId
): InvokeOperationBuilder {
  let input: unknown = {}
  let providerOverride: CapabilityId | undefined

  const builder: InvokeOperationBuilder = {
    with(payload: unknown) {
      input = payload
      return builder
    },
    uses(providerCapabilityId: CapabilityId | string) {
      providerOverride = providerCapabilityId as CapabilityId
      return builder
    },
    process<T = unknown>() {
      return executeInvoke(env, capabilityId, input, providerOverride) as Promise<InvokeResult<T>>
    },
  }

  return builder
}
