import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { dataEdgeInspectorMeta, type DataEdgeInspectorMeta } from "./edge-manifest.js"
import type { ReactFlowDataEdgeData } from "./types.js"

/**
 * Whether the data edge exposes an editable expression field (never on the graph model).
 * @category App
 */
export function dataEdgeEditable(_meta: DataEdgeInspectorMeta | undefined): boolean {
  return false
}

/**
 * Apply a draft text change for an editable data-edge marker.
 * @category App
 */
export function applyDataEdgeDraft(
  _manifest: ExecutionManifest,
  _targetStepId: string,
  _data: ReactFlowDataEdgeData,
  _exprText: string,
): ExecutionManifest | undefined {
  const meta = dataEdgeInspectorMeta(_manifest, _targetStepId, _data.inputPath)
  if (!meta || meta.markerKind !== "expr") return undefined
  return undefined
}