import {
  compileDiscoveryWorkflow,
  DISCOVERY_RAW_STEP_AS,
  formatDiscoveryFollowUpLines,
  flattenTestStepOrder,
  type CapabilityDefinition,
  type Ecp,
} from "@executioncontrolprotocol/core"
import type {
  CapabilityMetadata,
  StepNode,
  WorkflowManifest,
} from "@executioncontrolprotocol/types"

/** Result of preparing a disposable discovery workflow. @category Demo */
export interface DiscoveryWorkflowPrepareResult {
  /** Compiled or already-marked discovery workflow. */
  workflow: WorkflowManifest
  /** Capability the inspect workflow calls. */
  capabilityId: string
}

/**
 * Resolve the capability id a discovery workflow should inspect.
 * Prefers an explicit {@link WorkflowManifest.discovery} marker, then a single step.
 * @category Demo
 */
export function resolveDiscoveryCapabilityId(
  workflow: WorkflowManifest
): string | undefined {
  if (workflow.discovery?.capabilityId) return workflow.discovery.capabilityId
  const steps = flattenTestStepOrder(workflow.steps).filter(
    (step): step is StepNode =>
      step !== undefined &&
      (step.type === undefined || step.type === "step") &&
      typeof step.uses === "string"
  )
  if (steps.length === 1) return String(steps[0]!.uses)
  return undefined
}

/**
 * Prepare a discovery workflow for the run modal.
 * Compiles from the bound capability when the marker is missing.
 * @category Demo
 */
export function prepareDiscoveryWorkflow(
  workflow: WorkflowManifest,
  lookup: { getCapability: (id: string) => CapabilityDefinition | undefined }
): DiscoveryWorkflowPrepareResult | undefined {
  const capabilityId = resolveDiscoveryCapabilityId(workflow)
  if (!capabilityId) return undefined
  if (workflow.discovery?.capabilityId) {
    return { workflow, capabilityId }
  }
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
