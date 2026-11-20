import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import {
  dataEdgeInspectorMeta,
  replaceManifestPointer,
  routeEdgeInspectorMeta,
  type DataEdgeInspectorMeta,
  type RouteEdgeInspectorMeta,
} from "./edge-manifest.js"
import type { ReactFlowDataEdgeData, ReactFlowRouteEdgeData } from "./types.js"

/**
 * Apply a draft text change for an editable data-edge marker.
 * @category App
 */
export function applyDataEdgeDraft(
  manifest: ExecutionManifest,
  targetStepId: string,
  data: ReactFlowDataEdgeData,
  exprText: string,
): ExecutionManifest | undefined {
  const meta = dataEdgeInspectorMeta(manifest, targetStepId, data.inputPath)
  if (!meta || meta.markerKind !== "expr-gate") return undefined
  return replaceManifestPointer(manifest, meta.manifestPointer, exprText)
}

/**
 * Apply a draft text change for an editable route-edge `expr`.
 * @category App
 */
export function applyRouteEdgeDraft(
  manifest: ExecutionManifest,
  data: ReactFlowRouteEdgeData,
  exprText: string,
): ExecutionManifest | undefined {
  const meta = routeEdgeInspectorMeta(manifest, data)
  if (!meta || meta.defaultArm || !meta.manifestPointer) return undefined
  return replaceManifestPointer(manifest, meta.manifestPointer, exprText)
}

/**
 * Whether the data edge exposes an editable expression field.
 * @category App
 */
export function dataEdgeEditable(meta: DataEdgeInspectorMeta | undefined): boolean {
  return meta?.markerKind === "expr-gate"
}

/**
 * Whether the route edge exposes an editable `expr`.
 * @category App
 */
export function routeEdgeEditable(meta: RouteEdgeInspectorMeta | undefined): boolean {
  return meta !== undefined && !meta.defaultArm && meta.manifestPointer.length > 0
}