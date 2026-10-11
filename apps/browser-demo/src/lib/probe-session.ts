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
  ProbeContext,
  ProbeOption,
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
 * Prepare a discovery workflow for the run modal.
 * Compiles from the bound capability when the marker is missing.
 * @category Demo
 */
export function prepareDiscoveryWorkflow(
  workflow: WorkflowManifest,
  lookup: { getCapability: (id: string) => CapabilityDefinition | undefined },
  preferredCapabilityId?: string
): DiscoveryWorkflowPrepareResult | undefined {
  const capabilityId = resolveDiscoveryCapabilityId(workflow, preferredCapabilityId)
  if (!capabilityId) return undefined
  if (
    workflow.discovery?.capabilityId === capabilityId &&
    stepUsesList(workflow).length === 1
  ) {
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

function collectProbeOptions(value: unknown, limit = 24): ProbeOption[] {
  const options: ProbeOption[] = []
  const visit = (node: unknown, path: string) => {
    if (options.length >= limit || node === null || node === undefined) return
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length && options.length < limit; i++) {
        const item = node[i]
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const row = item as Record<string, unknown>
          const id =
            typeof row.id === "string" || typeof row.id === "number"
              ? String(row.id)
              : typeof row.name === "string"
                ? row.name
                : `${path}.${i}`
          const label =
            typeof row.name === "string"
              ? row.name
              : typeof row.label === "string"
                ? row.label
                : id
          options.push({ id, label, path: `${path}.${i}` })
        } else {
          visit(item, `${path}.${i}`)
        }
      }
      return
    }
    if (typeof node === "object") {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        if (options.length >= limit) break
        if (key === "layers" || key === "parts" || key === "items" || key === "options") {
          visit(child, path ? `${path}.${key}` : key)
        }
      }
    }
  }
  visit(value, "raw")
  return options
}

/**
 * Build a small {@link ProbeContext} after a successful discovery run.
 * @category Demo
 */
export function buildProbeContextAfterDiscovery(options: {
  capabilityId: string
  output: unknown
  summary?: string
}): ProbeContext {
  const optionsList = collectProbeOptions(options.output)
  const summary =
    options.summary?.trim() ||
    (optionsList.length > 0
      ? `Inspected ${options.capabilityId}; ${optionsList.length} selectable option(s).`
      : `Inspected ${options.capabilityId}.`)
  return {
    probeId: `probe-${Date.now()}`,
    domain: options.capabilityId,
    stepAs: DISCOVERY_RAW_STEP_AS,
    summary,
    options: optionsList,
  }
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
