import {
  flattenJsonSchemaProperties,
  flattenStepOrder,
  jsonSchemaObjectProperties,
} from "@executioncontrolprotocol/core"
import type { CapabilityDescription, StepNode, WorkflowManifest } from "@executioncontrolprotocol/core/types"
import { toJsonObjectSchema, type ReactFlowPort } from "../../graph/index.js"
import type { GraphEditResult } from "./graph-edit.js"
import { connectPorts } from "./graph-edit.js"
import type { CapabilityDiscoveryOrigin } from "./capability-discovery.js"
import { findStepById, replaceStepById } from "./step-configure.js"
import { OUTPUT_HANDLE_ID, portsAreCompatible, type PortTypeSource } from "./step-connect.js"

const IDENTIFIER_MAX = 64

function identifierFromLabel(label: string): string {
  const raw = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, IDENTIFIER_MAX)
  const base = raw.length > 0 ? raw : "step"
  return /^[a-z_]/.test(base) ? base : `s_${base}`
}

function uniqueIdentifier(base: string, used: Set<string>): string {
  let id = base
  let suffix = 2
  while (used.has(id)) {
    id = `${base}_${suffix}`
    suffix += 1
  }
  used.add(id)
  return id
}

function usedIdsAndAs(manifest: WorkflowManifest): { ids: Set<string>; asKeys: Set<string> } {
  const ids = new Set<string>()
  const asKeys = new Set<string>()
  for (const step of flattenStepOrder(manifest.steps)) {
    if (step.id) ids.add(step.id)
    if (step.as) asKeys.add(step.as)
  }
  return { ids, asKeys }
}

function capabilityLabel(cap: CapabilityDescription): string {
  if (cap.label && cap.label.trim()) return cap.label.trim()
  const dotted = cap.id.split(".").pop()
  return dotted && dotted.trim() ? dotted.trim() : cap.id
}

function portFromSchemaField(field: {
  name: string
  schema: Record<string, unknown>
  required: boolean
}): ReactFlowPort {
  const t = field.schema.type
  const base = typeof t === "string" ? t : "unknown"
  return {
    id: field.name,
    name: field.name,
    typeLabel: field.required ? `${base}!` : base,
    required: field.required,
    valueSchema: field.schema,
  }
}

/**
 * Ports from a capability JSON Schema.
 * Inputs stay top-level. Outputs flatten nested object primitives, keep arrays
 * as one port, and always include the whole-document `output` handle.
 * @category App
 */
export function portsFromCapabilitySchema(
  schema: unknown,
  role: "input" | "output"
): ReactFlowPort[] {
  const json = toJsonObjectSchema(schema)
  const fields =
    role === "output" ? flattenJsonSchemaProperties(json) : jsonSchemaObjectProperties(json)
  const ports = fields.map(portFromSchemaField)
  if (role === "output" && !ports.some((port) => port.id === OUTPUT_HANDLE_ID)) {
    ports.unshift({
      id: OUTPUT_HANDLE_ID,
      name: OUTPUT_HANDLE_ID,
      typeLabel: "object",
      valueSchema: { type: "object" },
    })
  }
  return ports
}

/**
 * First compatible port: required matches in schema order, then optional.
 * @category App
 */
export function firstMatchingPort(
  candidates: ReactFlowPort[],
  incoming: PortTypeSource,
  direction: "downstream" | "upstream"
): ReactFlowPort | undefined {
  const compatible = candidates.filter((port) =>
    direction === "downstream"
      ? portsAreCompatible(incoming, port)
      : portsAreCompatible(port, incoming)
  )
  return compatible.find((port) => port.required) ?? compatible[0]
}

function withStepAs(manifest: WorkflowManifest, stepId: string, asKey: string): WorkflowManifest {
  const step = findStepById(manifest.steps, stepId)
  if (!step) return manifest
  return {
    ...manifest,
    steps: replaceStepById(manifest.steps, stepId, { ...step, as: asKey }),
  }
}

function appendStep(manifest: WorkflowManifest, step: StepNode): WorkflowManifest {
  return {
    ...manifest,
    steps: [...manifest.steps, step],
  }
}

/**
 * Insert a capability as a new step and wire the discovery origin to the first
 * type-compatible port. No matching port still inserts the step.
 * @category App
 */
export function addCapabilityStep(
  manifest: WorkflowManifest,
  args: {
    /** Selected capability from the search modal. */
    capability: CapabilityDescription
    /** Port the user dragged onto empty canvas. */
    origin: CapabilityDiscoveryOrigin
  }
): GraphEditResult {
  const { capability, origin } = args
  const used = usedIdsAndAs(manifest)
  const label = capabilityLabel(capability)
  const base = identifierFromLabel(label)
  const id = uniqueIdentifier(base, used.ids)
  const asKey = uniqueIdentifier(base, used.asKeys)
  const step: StepNode = {
    type: "step",
    id,
    label,
    uses: capability.id,
    as: asKey,
  }

  let next = appendStep(manifest, step)
  const downstream = origin.handleType === "source"

  if (downstream) {
    const inputs = portsFromCapabilitySchema(capability.inputSchema, "input")
    const match = firstMatchingPort(inputs, origin.port, "downstream")
    if (!match) return { ok: true, manifest: next }
    const source = findStepById(next.steps, origin.nodeId)
    if (source && !source.as) {
      next = withStepAs(next, origin.nodeId, uniqueIdentifier(identifierFromLabel(source.label ?? source.id), used.asKeys))
    }
    return connectPorts(next, {
      sourceStepId: origin.nodeId,
      targetStepId: id,
      sourceHandle: origin.handleId,
      targetHandle: match.id,
      valueSchema: origin.port.valueSchema ?? match.valueSchema,
      targetRequired: match.required,
    })
  }

  const outputs = portsFromCapabilitySchema(capability.outputSchema, "output")
  const match = firstMatchingPort(outputs, origin.port, "upstream")
  if (!match) return { ok: true, manifest: next }
  return connectPorts(next, {
    sourceStepId: id,
    targetStepId: origin.nodeId,
    sourceHandle: match.id,
    targetHandle: origin.handleId,
    valueSchema: match.valueSchema ?? origin.port.valueSchema,
    targetRequired: origin.port.required,
  })
}
