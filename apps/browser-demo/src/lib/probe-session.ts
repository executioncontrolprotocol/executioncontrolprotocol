import {
  buildProbeContextFromDiscovery,
  clearDiscoveryMode,
  compileDiscoveryWorkflow,
  DISCOVERY_RAW_STEP_AS,
  formatDiscoveryFollowUpLines,
  flattenTestStepOrder,
  type BuildProbeContextFromDiscoveryResult,
  type CapabilityDefinition,
  type Ecp,
} from "@executioncontrolprotocol/core"
import type {
  CapabilityMetadata,
  ProbeContext,
  StepNode,
  WorkflowManifest,
} from "@executioncontrolprotocol/types"

/** Result of normalizing a discovery workflow onto the shared canvas. @category Demo */
export interface DiscoveryWorkflowPrepareResult {
  /** Capability-derived discovery workflow (shared canvas/run object). */
  workflow: WorkflowManifest
  /** Capability the inspect workflow calls. */
  capabilityId: string
}

/** Host copy when discovery excerpt hits the context budget. @category Demo */
export const DISCOVERY_TRUNCATION_TRANSFORM_SUGGESTION =
  "The inspect output was truncated for chat context. Add a bound JSON transform step that projects only the fields you need into workflow state, then continue."

function stepUsesList(workflow: WorkflowManifest): string[] {
  return flattenTestStepOrder(workflow.steps)
    .filter(
      (step): step is StepNode =>
        step !== undefined &&
        (step.type === undefined || step.type === "step") &&
        typeof step.uses === "string"
    )
    .map((step) => String(step.uses))
}

/**
 * Resolve the capability id a discovery workflow should inspect.
 * Prefers an explicit {@link WorkflowManifest.discovery} marker, then a single step,
 * then the first inspect-like step, then the first step.
 * @category Demo
 */
export function resolveDiscoveryCapabilityId(
  workflow: WorkflowManifest,
  preferredCapabilityId?: string
): string | undefined {
  if (preferredCapabilityId?.trim()) return preferredCapabilityId.trim()
  if (workflow.discovery?.capabilityId) return workflow.discovery.capabilityId
  const uses = stepUsesList(workflow)
  if (uses.length === 1) return uses[0]
  if (uses.length === 0) return undefined
  const inspectLike = uses.find((id) => /inspect|manifest|describe|metadata|stats/i.test(id))
  return inspectLike ?? uses[0]
}

/**
 * Normalize a discovery workflow onto the shared canvas/run object.
 * Always compiles from the bound capability so `accepts` match the registry.
 * @category Demo
 */
export function prepareDiscoveryWorkflow(
  workflow: WorkflowManifest,
  lookup: { getCapability: (id: string) => CapabilityDefinition | undefined },
  preferredCapabilityId?: string
): DiscoveryWorkflowPrepareResult | undefined {
  const capabilityId = resolveDiscoveryCapabilityId(workflow, preferredCapabilityId)
  if (!capabilityId) return undefined
  return {
    workflow: compileDiscoveryWorkflow(capabilityId, lookup),
    capabilityId,
  }
}

/**
 * Format projections plus a capped excerpt after a discovery run.
 * @category Demo
 */
export function formatDiscoveryFollowUpMessage(options: {
  capabilityId: string
  projections?: CapabilityMetadata["projections"]
  output: unknown
}): string {
  return formatDiscoveryFollowUpLines(options).join("\n")
}

/**
 * Read the discovery step output from a completed run state.
 * @category Demo
 */
export function discoveryOutputFromState(
  state: Record<string, unknown> | undefined
): unknown {
  if (!state) return undefined
  if (DISCOVERY_RAW_STEP_AS in state) return state[DISCOVERY_RAW_STEP_AS]
  const keys = Object.keys(state)
  return keys.length > 0 ? state[keys[keys.length - 1]!] : undefined
}

/**
 * Look up capability metadata projections from an {@link Ecp} registry.
 * @category Demo
 */
export function projectionsForCapability(
  ecp: Pick<Ecp, "getRegistry">,
  capabilityId: string
): CapabilityMetadata["projections"] | undefined {
  return ecp.getRegistry().getCapability(capabilityId)?.metadata?.projections
}

/**
 * Build {@link ProbeContext} after a successful discovery run (projections + compact excerpt).
 * @category Demo
 */
export function buildProbeContextAfterDiscovery(options: {
  capabilityId: string
  output: unknown
  projections?: CapabilityMetadata["projections"]
}): BuildProbeContextFromDiscoveryResult {
  return buildProbeContextFromDiscovery(options)
}

/**
 * Slim run-result snapshot for harness context (no state/history payloads).
 * @category Demo
 */
export function slimDiscoveryRunResult(result: {
  schema?: string
  version?: string
  run?: { id?: string; status?: string }
}): Record<string, unknown> {
  return {
    schema: "@executioncontrolprotocol.run.result",
    version: result.version ?? "1.0",
    run: {
      id: result.run?.id ?? "discovery",
      status: result.run?.status ?? "completed",
    },
  }
}

export { clearDiscoveryMode }

export type { ProbeContext }
