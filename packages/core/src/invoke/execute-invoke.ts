import {
  ECP_INVOKE_ERROR_CODES,
  LATEST_ECP_VERSION,
  type CapabilityId,
  type InvokeResult,
  type UsageSummary,
} from "@executioncontrolprotocol/types"
import type { Environment } from "../environment/environment.js"
import type { ResolvedBindings } from "../environment/bindings.js"
import { isHarnessCapabilityId } from "../harness/harness-catalog.js"
import { executeHarnessInvoke } from "../harness/execute-harness.js"
import { createUtilityCapabilityContext } from "../encoding/utility-context.js"
import { evaluatePolicies } from "../runtime/policy-engine.js"
import { createUsageLedger, type CapabilityContext, type PolicyContext } from "../runtime/context.js"
import { emptyValidationResult } from "../validate/workflow-schema.js"
import { zodIssuesToValidationIssues } from "../validate/zod-mapper.js"
import { LATEST_ECP_VERSION as CORE_VERSION } from "@executioncontrolprotocol/types"

const INVOKE_STUB_WORKFLOW = {
  schema: "@executioncontrolprotocol.workflow" as const,
  version: LATEST_ECP_VERSION,
  workflow: { id: "invoke-stub" },
  steps: [],
}

function invokeFailure(
  capabilityId: CapabilityId,
  code: string,
  message: string,
  validation?: import("@executioncontrolprotocol/types").ValidationResult
): InvokeResult {
  return {
    schema: "@executioncontrolprotocol.invoke.result",
    version: CORE_VERSION,
    success: false,
    capabilityId,
    validation,
    diagnostics: [{ severity: "error", code, message }],
  }
}

function usageSummary(ledger: ReturnType<typeof createUsageLedger>): UsageSummary | undefined {
  if (
    ledger.modelCalls === 0 &&
    ledger.costUsd === 0 &&
    ledger.tokens === 0 &&
    ledger.retries === 0
  ) {
    return undefined
  }
  return {
    modelCalls: ledger.modelCalls,
    costUsd: ledger.costUsd,
    tokens: ledger.tokens,
    retries: ledger.retries,
  }
}

function findExtensionConfig(
  bindings: ResolvedBindings,
  capabilityId: CapabilityId
): Record<string, unknown> | undefined {
  const extPrefix = capabilityId.replace(/\.[^.]+$/, "")
  const binding = bindings.extensions.find((e) => e.id === extPrefix)
  return binding?.config
}

/**
 * Execute a capability outside workflow run/step lifecycle.
 * @category Invoke
 * @internal
 */
export async function executeInvoke(
  env: Environment,
  capabilityId: CapabilityId,
  input: unknown,
  providerOverride?: CapabilityId
): Promise<InvokeResult> {
  await env.ensureBoundExtensionsRegistered()
  await env.ensureReady()

  if (isHarnessCapabilityId(capabilityId)) {
    return executeHarnessInvoke(
      env,
      capabilityId as import("@executioncontrolprotocol/types").HarnessCapabilityId,
      input,
      providerOverride
    )
  }

  const registry = env.getRegistry()
  const cap = registry.getCapability(capabilityId)
  if (!cap) {
    return invokeFailure(
      capabilityId,
      ECP_INVOKE_ERROR_CODES.CAPABILITY_NOT_FOUND,
      `Capability not registered: ${capabilityId}`
    )
  }

  let validation = emptyValidationResult(true)
  if (cap.inputSchema) {
    const parsed = cap.inputSchema.safeParse(input)
    if (!parsed.success) {
      validation = emptyValidationResult(false)
      validation.errors.push(...zodIssuesToValidationIssues(parsed.error.issues))
      return invokeFailure(
        capabilityId,
        ECP_INVOKE_ERROR_CODES.INVOKE_INPUT_INVALID,
        "Invoke input validation failed",
        validation
      )
    }
    input = parsed.data
  }

  const bindings = env.ecpResolveBindings()
  const policyCtx: PolicyContext = {
    workflow: INVOKE_STUB_WORKFLOW,
    run: { id: env.getEnvId(), input: {} },
    step: { id: "invoke", capabilityId },
    state: {},
    input: (input ?? {}) as Record<string, unknown>,
    usage: createUsageLedger(),
    scope: "invoke",
    operation: "invoke",
    capabilityId,
  }

  const preDecision = await evaluatePolicies("policy:pre", bindings.policyHooks, policyCtx)
  if (preDecision.type === "deny") {
    return invokeFailure(
      capabilityId,
      ECP_INVOKE_ERROR_CODES.INVOKE_DENIED,
      preDecision.reason ?? "Invocation denied by policy"
    )
  }
  if (preDecision.type === "pause") {
    return invokeFailure(
      capabilityId,
      ECP_INVOKE_ERROR_CODES.INVOKE_DENIED,
      preDecision.reason ?? "Invocation paused by policy"
    )
  }

  const utilityCtx = createUtilityCapabilityContext(
    env.getEnvId(),
    env.getEnvLabel(),
    registry
  )
  const extensionConfig = findExtensionConfig(bindings, capabilityId)
  const capCtx: CapabilityContext & { extensionConfig?: Record<string, unknown> } = {
    store: utilityCtx.store,
    state: {},
    run: { id: env.getEnvId(), input: {} },
    step: { id: "invoke", capabilityId },
    logger: utilityCtx.logger,
    usage: policyCtx.usage,
    extensionConfig,
    capabilities: {
      call: async (id, nestedInput) => {
        const nested = registry.getCapability(id)
        if (!nested) throw new Error(`Unknown capability: ${id}`)
        return nested.handler(nestedInput, capCtx)
      },
    },
  }

  let output: unknown
  try {
    output = await cap.handler(input, capCtx)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return invokeFailure(capabilityId, ECP_INVOKE_ERROR_CODES.INVOKE_FAILED, message)
  }

  if (cap.outputSchema) {
    const parsed = cap.outputSchema.safeParse(output)
    if (!parsed.success) {
      const outValidation = emptyValidationResult(false)
      outValidation.errors.push(...zodIssuesToValidationIssues(parsed.error.issues))
      return invokeFailure(
        capabilityId,
        ECP_INVOKE_ERROR_CODES.INVOKE_OUTPUT_INVALID,
        "Invoke output validation failed",
        outValidation
      )
    }
    output = parsed.data
  }

  return {
    schema: "@executioncontrolprotocol.invoke.result",
    version: CORE_VERSION,
    success: true,
    capabilityId,
    result: output,
    validation,
    diagnostics: [],
    usage: usageSummary(policyCtx.usage),
  }
}
