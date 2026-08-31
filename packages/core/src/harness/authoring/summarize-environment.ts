import type { EnvironmentDescriptor } from "@executioncontrolprotocol/types"
import { isHarnessCapabilityId } from "../harness-catalog.js"
import {
  allCapabilityInputNames,
  formatCapabilityInputLabels,
  introspectCapabilitySchema,
} from "./summarize-capability-schema.js"

/** Compact capability row for model prompts. @category Harness */
export interface CompactCapabilityRow {
  /** Capability id. */
  id: string
  /** Owning extension id. */
  extension: string
  /** Required input field names. */
  requiredInputs: string[]
  /** Optional input field names. */
  optionalInputs: string[]
  /** All input field names (required first). */
  inputs: string[]
  /** Output field names from schema. */
  outputs: string[]
}

/** Compact environment summary for small models. @category Harness */
export interface CompactEnvironmentSummary {
  /** Extension rows with capability ids. */
  extensions: Array<{ id: string; capabilities: string[] }>
  /** Flat capability rows. */
  capabilities: CompactCapabilityRow[]
}

function toCapabilityRow(
  cap: { id: string; extension: string; inputSchema?: unknown; outputSchema?: unknown }
): CompactCapabilityRow {
  const inputFields = introspectCapabilitySchema(cap.inputSchema)
  const outputFields = introspectCapabilitySchema(cap.outputSchema)
  return {
    id: cap.id,
    extension: cap.extension,
    requiredInputs: inputFields.required,
    optionalInputs: inputFields.optional,
    inputs: allCapabilityInputNames(inputFields),
    outputs: allCapabilityInputNames(outputFields),
  }
}

/**
 * Build a compact environment summary from a full describe() result.
 * Omits app/runtime tooling (formats, browser host extensions) and non-step capabilities.
 * @category Harness
 */
export function summarizeEnvironmentDescriptor(
  descriptor: EnvironmentDescriptor
): CompactEnvironmentSummary {
  const authoring = toAuthoringEnvironmentDescriptor(descriptor)
  const extensions = [...(authoring.extensions ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((ext) => ({
      id: ext.id,
      capabilities: [...(ext.capabilities ?? [])],
    }))

  const capabilities = (authoring.capabilities ?? []).map((cap) => toCapabilityRow(cap))

  return { extensions, capabilities }
}

/**
 * Project a full {@link EnvironmentDescriptor} to the inventory harnesses/models should see:
 * workflow-step capabilities and their owning extensions only.
 * @category Harness
 */
export function toAuthoringEnvironmentDescriptor(
  descriptor: EnvironmentDescriptor
): EnvironmentDescriptor {
  const capabilities = (descriptor.capabilities ?? []).filter(
    (cap) =>
      isWorkflowStepCapability(cap.id) && isAuthoringInventoryExtension(cap.extension)
  )
  const capabilityIds = new Set(capabilities.map((c) => c.id))
  const extensions = (descriptor.extensions ?? [])
    .filter((ext) => isAuthoringInventoryExtension(ext.id))
    .map((ext, order) => ({
      ...ext,
      order,
      capabilities: (ext.capabilities ?? []).filter((id) => capabilityIds.has(id)),
    }))
    .filter((ext) => ext.capabilities.length > 0)

  return {
    ...descriptor,
    extensions,
    capabilities,
  }
}

/** How to render capability rows in user prompts. @category Harness */
export type EnvironmentSummaryFormat = "plain" | "eql-create" | "eql-patch"

const TEST_NON_STEP_CAPABILITY_IDS = new Set(["@executioncontrolprotocol/test.generate"])

const NON_STEP_CAPABILITY_SUFFIXES = new Set([
  "checkAvailability",
  "startModelDownload",
  "getModelInstallState",
  "evaluate",
  "guideChat",
  "encode",
  "decode",
  "listModels",
])

/** True when a capability id is suitable as a workflow STEP USES target. @category Harness */
export function isWorkflowStepCapability(capId: string): boolean {
  if (isHarnessCapabilityId(capId)) return false
  if (TEST_NON_STEP_CAPABILITY_IDS.has(capId)) return false
  const suffix = capabilitySuffix(capId)
  if (NON_STEP_CAPABILITY_SUFFIXES.has(suffix)) return false
  if (capId.includes("/format-") || capId.includes("/format-json.")) return false
  return true
}

/** True when an extension is app/runtime tooling rather than workflow inventory. @category Harness */
export function isAuthoringInventoryExtension(extensionId: string): boolean {
  if (extensionId.includes("/format-")) return false
  if (extensionId === "@executioncontrolprotocol/format-json") return false
  if (extensionId.startsWith("@executioncontrolprotocol/browser-")) return false
  if (extensionId === "@executioncontrolprotocol/browser") return false
  if (extensionId.startsWith("@browser-demo/")) return false
  return true
}

function capabilitySuffix(capId: string): string {
  const parts = capId.split(".")
  return parts[parts.length - 1] ?? ""
}

function workflowStepCapabilities(summary: CompactEnvironmentSummary): CompactCapabilityRow[] {
  return summary.capabilities.filter((cap) => isWorkflowStepCapability(cap.id))
}

function capabilityStepId(capId: string): string {
  return capabilitySuffix(capId) || "step"
}

function sampleValueForField(field: string): string {
  if (field === "prompt") return `"..."`
  if (field === "endpoint") return `"fal-ai/flux/schnell"`
  if (field === "input") return `{"prompt": "..."}`
  if (field === "image") return `{"uri": "https://example.com/image.png"}`
  if (field === "value") return `"hello"`
  if (field === "text") return `REF echo.output`
  if (field === "payload") return `{"ok": true}`
  if (field === "system") return `"..."`
  if (field === "context") return `REF priorStep.output`
  if (field === "model") return `"..."`
  return `"..."`
}

function sampleWithLines(cap: CompactCapabilityRow): string[] {
  const fields =
    cap.requiredInputs.length > 0 || cap.optionalInputs.length > 0
      ? [...cap.requiredInputs, ...cap.optionalInputs.slice(0, 2)]
      : cap.inputs
  if (fields.length === 0) return []
  return fields.map((field) => `  WITH ${field} = ${sampleValueForField(field)}`)
}

function formatInputSummary(cap: CompactCapabilityRow): string {
  if (cap.requiredInputs.length === 0 && cap.optionalInputs.length === 0) {
    return cap.inputs.length > 0
      ? `inputs: ${cap.inputs.join(", ")}`
      : "inputs: none"
  }
  return `inputs: ${formatCapabilityInputLabels({
    required: cap.requiredInputs,
    optional: cap.optionalInputs,
  })}`
}

function capabilityEqlCreateSnippet(cap: CompactCapabilityRow): string[] {
  const stepId = capabilityStepId(cap.id)
  const outputPart = cap.outputs.length > 0 ? `; outputs: ${cap.outputs.join(", ")}` : ""
  return [
    `# ${cap.id}`,
    `#   ${formatInputSummary(cap)}${outputPart}`,
    `STEP ${stepId} USES ${cap.id}`,
    `  LABEL "${stepId.charAt(0).toUpperCase()}${stepId.slice(1)}"`,
    ...sampleWithLines(cap),
    `  AS ${stepId}`,
  ]
}

function capabilityEqlPatchSnippet(
  cap: CompactCapabilityRow,
  alreadyInWorkflow: boolean
): string[] {
  if (alreadyInWorkflow) {
    return [
      `# ${cap.id} (already used by an existing step — UPDATE STEP or DELETE STEP, not ADD STEP)`,
    ]
  }
  const outputPart = cap.outputs.length > 0 ? `; outputs: ${cap.outputs.join(", ")}` : ""
  return [
    `# ${cap.id}`,
    `#   ${formatInputSummary(cap)}${outputPart}`,
    `#   ADD STEP <newStepId> USES ${cap.id} AFTER|BEFORE <anchorStepId from current workflow>`,
  ]
}

/**
 * Plain-text capability lines for small models (readable without parsing TOON).
 * @category Harness
 */
export function formatEnvironmentSummaryLines(
  summary: CompactEnvironmentSummary,
  options?: { format?: EnvironmentSummaryFormat; existingCapabilityUses?: ReadonlySet<string> }
): string[] {
  const format = options?.format ?? "plain"
  const existingUses = options?.existingCapabilityUses ?? new Set<string>()

  if (format === "eql-create") {
    const lines = [
      "EQL capability reference (exact ids — copy USES values verbatim):",
      "",
    ]
    for (const cap of workflowStepCapabilities(summary)) {
      lines.push(...capabilityEqlCreateSnippet(cap), "")
    }
    return lines
  }

  if (format === "eql-patch") {
    const lines = [
      "EQL patch reference (ADD STEP inserts; existing steps stay unless DELETE STEP):",
      "",
    ]
    for (const cap of workflowStepCapabilities(summary)) {
      lines.push(...capabilityEqlPatchSnippet(cap, existingUses.has(cap.id)), "")
    }
    return lines
  }

  const lines = ["Capability ids you may reference (exact strings):"]
  for (const cap of workflowStepCapabilities(summary)) {
    const io =
      cap.inputs.length > 0 || cap.outputs.length > 0
        ? ` (${formatInputSummary(cap)}; outputs: ${cap.outputs.join(", ") || "none"})`
        : ""
    lines.push(`- ${cap.id}${io}`)
  }
  lines.push("Extensions:")
  for (const ext of summary.extensions.filter((e) => isAuthoringInventoryExtension(e.id))) {
    const caps = ext.capabilities.filter((id) => isWorkflowStepCapability(id))
    if (caps.length === 0) continue
    lines.push(`- ${ext.id}: ${caps.join(", ")}`)
  }
  return lines
}

export type { CapabilitySchemaFields } from "./summarize-capability-schema.js"