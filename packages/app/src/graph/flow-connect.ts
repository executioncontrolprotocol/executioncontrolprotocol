import type { Connection } from "@xyflow/react"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { detachedNodeIds } from "./connection-edit.js"
import { EXECUTION_ACCEPTS_NODE_ID } from "./io-from-schema.js"
import type { ReactFlowDocument, ReactFlowFrameData } from "./types.js"
import { FLOW_IN_HANDLE, FLOW_OUT_HANDLE } from "./types.js"

export type FlowConnectAction =
  | { kind: "attachAfter"; sourceId: string; detachedId: string }
  | { kind: "attachAsArm"; branchId: string; detachedId: string }
  | { kind: "attachAsLine"; parallelId: string; detachedId: string }

function detachedRoots(manifest: ExecutionManifest): Set<string> {
  const roots = new Set<string>()
  const list = manifest.detached
  if (!Array.isArray(list)) return roots
  for (const node of list) roots.add(node.id)
  return roots
}

function nodeInSteps(manifest: ExecutionManifest, id: string): boolean {
  const walk = (nodes: ExecutionManifest["steps"]): boolean => {
    for (const node of nodes) {
      if (node.id === id) return true
      if (node.type === "branch") {
        for (const arm of node.branches) if (walk(arm.steps)) return true
      } else if (node.type === "parallel") {
        for (const line of node.branches) if (walk(line)) return true
      } else if (node.type === "loop") {
        if (walk(node.steps)) return true
      }
    }
    return false
  }
  return walk(manifest.steps)
}

function resolveDetachedTarget(
  manifest: ExecutionManifest,
  document: ReactFlowDocument,
  targetId: string,
): string | undefined {
  const roots = detachedRoots(manifest)
  if (roots.has(targetId)) return targetId
  const node = document.nodes.find((entry) => entry.id === targetId)
  if (!node) return undefined
  if (node.type === "ecp-frame") {
    const structureId = (node.data as ReactFlowFrameData).structureId
    if (roots.has(structureId)) return structureId
  }
  return undefined
}

function structureInFlow(
  document: ReactFlowDocument,
  manifest: ExecutionManifest,
  structureId: string,
): "branch" | "parallel" | undefined {
  if (!nodeInSteps(manifest, structureId)) return undefined
  const frame = document.nodes.find(
    (node) => node.type === "ecp-frame" && (node.data as ReactFlowFrameData).structureId === structureId,
  )
  if (!frame) return undefined
  const kind = (frame.data as ReactFlowFrameData).structureKind
  if (kind === "branch" || kind === "parallel") return kind
  return undefined
}

/**
 * Validate a flow-handle connection and return the manifest edit to apply.
 * @category App
 */
export function resolveFlowConnect(
  manifest: ExecutionManifest,
  document: ReactFlowDocument,
  connection: Connection,
): FlowConnectAction | undefined {
  const source = connection.source
  const target = connection.target
  if (!source || !target) return undefined
  if (connection.sourceHandle !== FLOW_OUT_HANDLE || connection.targetHandle !== FLOW_IN_HANDLE) return undefined

  const exempt = detachedNodeIds(manifest)
  const detachedTarget = resolveDetachedTarget(manifest, document, target)
  const sourceIsDetached = exempt.has(source) || detachedRoots(manifest).has(source)

  if (detachedTarget && !sourceIsDetached) {
    const sourceId = nodeInSteps(manifest, source) || source === EXECUTION_ACCEPTS_NODE_ID ? source : undefined
    if (!sourceId) return undefined
    return { kind: "attachAfter", sourceId, detachedId: detachedTarget }
  }

  if (sourceIsDetached && detachedRoots(manifest).has(source)) {
    const frame = document.nodes.find((node) => node.id === target && node.type === "ecp-frame")
    if (frame) {
      const data = frame.data as ReactFlowFrameData
      if ((data as ReactFlowFrameData).detached) return undefined
      if (data.structureKind === "branch") return { kind: "attachAsArm", branchId: data.structureId, detachedId: source }
      if (data.structureKind === "parallel") return { kind: "attachAsLine", parallelId: data.structureId, detachedId: source }
    }
    const targetKind = structureInFlow(document, manifest, target)
    if (targetKind === "branch") return { kind: "attachAsArm", branchId: target, detachedId: source }
    if (targetKind === "parallel") return { kind: "attachAsLine", parallelId: target, detachedId: source }
  }

  return undefined
}

/**
 * Whether a flow connection is allowed in the manifest editor.
 * @category App
 */
export function isValidManifestFlowConnection(
  manifest: ExecutionManifest,
  document: ReactFlowDocument,
  connection: Connection,
): boolean {
  return resolveFlowConnect(manifest, document, connection) !== undefined
}