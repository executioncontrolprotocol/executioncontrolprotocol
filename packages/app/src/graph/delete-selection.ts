import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { connectorDeletePreview, deleteConnector } from "./connection-edit.js"
import { findNodePlacement } from "./manifest-walk.js"
import {
  deleteStep,
  unwrapStructure,
  type StructureEditResult,
} from "./structure-edit.js"
import { parseEndMarkerId, type ReactFlowEdge } from "./types.js"

/** Why a control `end` node can't be deleted on its own. @category App */
export const STRUCTURE_EDIT_DELETE_END = "Delete the control node instead"

/**
 * Canvas selection mapped to a delete edit: a start node (`if` / `parallel` / `loop`) is removed and its nodes stay,
 * a loop `end` is refused, a branch loses its `$ref`.
 * @category App
 */
export type DeleteSelection =
  | { kind: "none" }
  | { kind: "steps"; stepIds: readonly string[] }
  | { kind: "structure"; structureId: string }
  | { kind: "end"; endNodeId: string }
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
  if (selection.kind === "end") return { ok: false, reason: STRUCTURE_EDIT_DELETE_END }
  const preview = connectorDeletePreview(manifest, selection.edge)
  if (!preview.ok) return { ok: false, reason: preview.reason }
  return deleteConnector(manifest, selection.edge)
}

/**
 * Whether `structureId` is the id of a start node (`if`, `parallel` or `loop`), not a step.
 * @category App
 */
export function isStructureHeaderSelection(manifest: ExecutionManifest, structureId: string): boolean {
  const hit = findNodePlacement(manifest.steps, structureId)
  if (!hit) return false
  const node = hit.parent[hit.index]
  return node.type === "if" || node.type === "parallel" || node.type === "loop"
}
/**
 * Whether `nodeId` is the React Flow id of a loop `end` node that exists in the manifest.
 * @category App
 */
export function isEndNodeSelection(manifest: ExecutionManifest, nodeId: string): boolean {
  const parsed = parseEndMarkerId(nodeId)
  if (!parsed) return false
  const structureId = parsed.structureId
  const hit = findNodePlacement(manifest.steps, structureId)
  if (!hit) return false
  return hit.node.type === "if" || hit.node.type === "parallel" || hit.node.type === "loop"
}
