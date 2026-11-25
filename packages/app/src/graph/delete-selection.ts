import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { connectorDeletePreview, deleteConnector } from "./connection-edit.js"
import { findNodePlacement } from "./manifest-walk.js"
import {
  deleteStep,
  unwrapStructure,
  type StructureEditResult,
} from "./structure-edit.js"
import type { ReactFlowEdge } from "./types.js"

/**
 * Canvas selection mapped to a delete edit.
 * @category App
 */
export type DeleteSelection =
  | { kind: "none" }
  | { kind: "steps"; stepIds: readonly string[] }
  | { kind: "structure"; structureId: string }
  | { kind: "connector"; edge: ReactFlowEdge }

/**
 * Pure Delete / Backspace dispatch for the graph selection.
 * @category App
 */
export function deleteSelection(
  manifest: ExecutionManifest,
  selection: DeleteSelection,
  readOnly: boolean,
): StructureEditResult | undefined {
  if (readOnly || selection.kind === "none") return undefined
  if (selection.kind === "steps") {
    if (selection.stepIds.length === 0) return undefined
    let current = manifest
    for (const stepId of selection.stepIds) {
      const result = deleteStep(current, stepId)
      if (!result.ok) return result
      current = result.manifest
    }
    return { ok: true, manifest: current }
  }
  if (selection.kind === "structure") {
    return unwrapStructure(manifest, selection.structureId)
  }
  const preview = connectorDeletePreview(manifest, selection.edge)
  if (!preview.ok) return { ok: false, reason: preview.reason }
  return deleteConnector(manifest, selection.edge)
}

/**
 * Whether `structureId` selects a branch, parallel, or loop container (not a step).
 * @category App
 */
export function isStructureHeaderSelection(manifest: ExecutionManifest, structureId: string): boolean {
  const hit = findNodePlacement(manifest.steps, structureId)
  if (!hit) return false
  const node = hit.parent[hit.index]
  return node.type === "if" || node.type === "parallel" || node.type === "loop"
}