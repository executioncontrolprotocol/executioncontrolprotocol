import {
  ECP_HARNESS_ERROR_CODES,
  ECP_INVOKE_ERROR_CODES,
  LATEST_ECP_VERSION,
  type CapabilityId,
  type HarnessCapabilityId,
  type InvokeResult,
} from "@executioncontrolprotocol/types"
import type { Environment } from "../environment/environment.js"
import { createUtilityCapabilityContext } from "../encoding/utility-context.js"
import { evaluatePolicies } from "../runtime/policy-engine.js"
import { createUsageLedger, type CapabilityContext } from "../runtime/context.js"
import { emptyValidationResult } from "../validate/workflow-schema.js"
import { zodIssuesToValidationIssues } from "../validate/zod-mapper.js"
import { getCatalogedHarness, harnessIdFromCapabilityId } from "./harness-catalog.js"
import { createHarnessCapabilityContext } from "./context.js"
import { findHarnessBinding } from "./resolve-harness-binding.js"
import { EcpImpl } from "../environment/ecp.js"

const INVOKE_STUB_WORKFLOW = {
  schema: "@executioncontrolprotocol.workflow" as const,
  version: LATEST_ECP_VERSION,
  workflow: { id: "invoke-stub" },
  steps: [],
}

function invokeFailure(
  capabilityId: HarnessCapabilityId,
  code: string,
  message: string,
  validation?: import("@executioncontrolprotocol/types").ValidationResult
): InvokeResult {
  return {
    schema: "@executioncontrolprotocol.invoke.result",
    version: LATEST_ECP_VERSION,
    success: false,
    capabilityId,
    validation,
    diagnostics: [{ severity: "error", code, message }],
  }
}

/**
 * Execute a harness evaluate capability.
 * @category Harness
 * @internal
 */
export async function executeHarnessInvoke(
  env: Environment,
  capabilityId: HarnessCapabilityId,
  input: unknown,
  providerOverride?: CapabilityId
): Promise<InvokeResult> {
  const harnessId = harnessIdFromCapabilityId(capabilityId)
  if (!harnessId) {
    return invokeFailure(
      capabilityId,
      ECP_INVOKE_ERROR_CODES.CAPABILITY_NOT_FOUND,
      `Not a harness capability: ${capabilityId}`
    )
  }

  const def = getCatalogedHarness(harnessId)
  if (!def) {
    return invokeFailure(
      capabilityId,
      ECP_HARNESS_ERROR_CODES.UNKNOWN_HARNESS,
      `Harness ${harnessId} is not registered.`
    )
  }

  const binding = findHarnessBinding(env, harnessId)
  if (!binding) {
    return invokeFailure(
      capabilityId,
      ECP_HARNESS_ERROR_CODES.HARNESS_NOT_BOUND,
      `Harness ${harnessId} is not bound in this environment.`
    )
  }

  const uses = providerOverride ?? binding.uses
  if (!uses) {
    return invokeFailure(
      capabilityId,
      ECP_HARNESS_ERROR_CODES.UNKNOWN_HARNESS_PROVIDER,
      `Harness ${harnessId} has no provider (.uses(...)).`
    )
  }

  let parsedInput = input
  if (def.inputSchema) {
    const parsed = def.inputSchema.safeParse(input)
    if (!parsed.success) {
      const validation = emptyValidationResult(false)
      validation.errors.push(...zodIssuesToValidationIssues(parsed.error.issues))
      return invokeFailure(
        capabilityId,
        ECP_INVOKE_ERROR_CODES.INVOKE_INPUT_INVALID,
        "Harness input validation failed",
        validation
      )
    }
    parsedInput = parsed.data
  }

  const bindings = env.ecpResolveBindings()
  const policyCtx = {
    workflow: INVOKE_STUB_WORKFLOW,
    run: { id: env.getEnvId(), input: {} },
    step: { id: "invoke", capabilityId },
    state: {},
    input: (parsedInput ?? {}) as Record<string, unknown>,
    usage: createUsageLedger(),
    scope: "invoke" as const,
    operation: "invoke",
    capabilityId,
  }

  const preDecision = await evaluatePolicies("policy:pre", bindings.policyHooks, policyCtx)
  if (preDecision.type === "deny" || preDecision.type === "pause") {
    return invokeFailure(
      capabilityId,
      ECP_INVOKE_ERROR_CODES.INVOKE_DENIED,
      preDecision.reason ?? "Harness invocation denied by policy"
    )
  }

  const registry = env.getRegistry()
  const utilityCtx = createUtilityCapabilityContext(
    env.getEnvId(),
    env.getEnvLabel(),
    registry
  )

  const extPrefix = uses.replace(/\.[^.]+$/, "")
  const extBinding = bindings.extensions.find((e) => e.id === extPrefix)

  const capCtx: CapabilityContext & { extensionConfig?: Record<string, unknown> } = {
    store: utilityCtx.store,
    state: {},
    run: { id: env.getEnvId(), input: {} },
    step: { id: "invoke", capabilityId },
    logger: utilityCtx.logger,
    usage: policyCtx.usage,
    extensionConfig: extBinding?.config,
    capabilities: {
      call: async (id, nestedInput) => {
        const nested = registry.getCapability(id)
        if (!nested) throw new Error(`Unknown capability: ${id}`)
        const nestedExt = bindings.extensions.find((e) => e.id === id.replace(/\.[^.]+$/, ""))
        const nestedCtx: CapabilityContext & { extensionConfig?: Record<string, unknown> } = {
          ...capCtx,
          extensionConfig: nestedExt?.config,
        }
        return nested.handler(nestedInput, nestedCtx)
      },
    },
  }

  const ecp = new EcpImpl(env)
  const harnessCtx = createHarnessCapabilityContext(
    harnessId,
    uses,
    binding.config,
    env,
    ecp,
    capCtx,
    def.configSchema
  )

  let output: unknown
  try {
    output = await def.handler(parsedInput, harnessCtx)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return invokeFailure(capabilityId, ECP_HARNESS_ERROR_CODES.HARNESS_EVALUATE_FAILED, message)
  }

  if (def.outputSchema) {
    const parsed = def.outputSchema.safeParse(output)
    if (!parsed.success) {
      const validation = emptyValidationResult(false)
      validation.errors.push(...zodIssuesToValidationIssues(parsed.error.issues))
      return invokeFailure(
        capabilityId,
        ECP_INVOKE_ERROR_CODES.INVOKE_OUTPUT_INVALID,
        "Harness output validation failed",
        validation
      )
    }
    output = parsed.data
  }

  return {
    schema: "@executioncontrolprotocol.invoke.result",
    version: LATEST_ECP_VERSION,
    success: true,
    capabilityId,
    result: output,
    validation: emptyValidationResult(true),
    diagnostics: [],
    usage:
      policyCtx.usage.modelCalls > 0
        ? {
            modelCalls: policyCtx.usage.modelCalls,
            costUsd: policyCtx.usage.costUsd,
            tokens: policyCtx.usage.tokens,
            retries: policyCtx.usage.retries,
          }
        : undefined,
  }
}
