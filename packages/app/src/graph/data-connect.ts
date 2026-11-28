import type { Connection } from "@xyflow/react"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import {
  CONNECTION_EDIT_HANDLE,
  CONNECTION_EDIT_INCOMPATIBLE,
  CONNECTION_EDIT_NOT_STEP,
  CONNECTION_EDIT_ORDER,
  CONNECTION_EDIT_SELF,
  CONNECTION_EDIT_SOURCE_DETACHED,
  type ConnectInputTarget,
  detachedNodeIds,
  placementManifestForDetachedConnect,
} from "./connection-edit.js"
import { findStepPlacement } from "./manifest-walk.js"
import { isStepNode } from "./io-from-schema.js"
import { portsAreCompatible } from "./port-compat.js"
import { sourceVisibleTo } from "./read-order.js"
import { EXECUTION_RETURNS_NODE_ID } from "./io-from-schema.js"
import {
  LOOP_COLLECT_HANDLE,
  LOOP_REF_HANDLE,
  loopIdFromEndMarker,
  type ReactFlowDocument,
  type ReactFlowIfData,
  type ReactFlowIoData,
  type ReactFlowLoopItemsData,
  type ReactFlowParallelData,
  type ReactFlowPort,
  type ReactFlowStepData,
} from "./types.js"

/**
 * Whether a handle id is a data port (not a flow handle).
 * @category App
 */
export function isDataHandle(handleId: string | null | undefined): boolean {
  return Boolean(handleId)
}

function stepPort(
  data: ReactFlowStepData,
  handleId: string,
  side: "input" | "output",
): ReactFlowPort | undefined {
  const list = side === "input" ? data.inputs : data.outputs
  return list.find((port) => port.id === handleId)
}

function ioPort(
  data: ReactFlowIoData,
  handleId: string,
  side: "input" | "output",
): ReactFlowPort | undefined {
  const list = side === "input" ? data.inputs : data.outputs
  return list.find((port) => port.id === handleId)
}

function structurePort(
  data: ReactFlowLoopItemsData | ReactFlowIfData | ReactFlowParallelData,
  handleId: string,
  side: "input" | "output",
): ReactFlowPort | undefined {
  const list = side === "input" ? data.inputs : data.outputs
  return list.find((port) => port.id === handleId)
}

/**
 * Look up a port on the encoded React Flow document.
 * @category App
 */
export function portOnDocument(
  document: ReactFlowDocument,
  nodeId: string,
  handleId: string,
  side: "input" | "output",
): ReactFlowPort | undefined {
  const node = document.nodes.find((entry) => entry.id === nodeId)
  if (!node) return undefined
  if (node.type === "ecp-step") return stepPort(node.data as ReactFlowStepData, handleId, side)
  if (node.type === "ecp-io") return ioPort(node.data as ReactFlowIoData, handleId, side)
  if (node.type === "ecp-end") return undefined
  if (node.type === "ecp-loop" || node.type === "ecp-if" || node.type === "ecp-parallel") {
    return structurePort(node.data as ReactFlowLoopItemsData | ReactFlowIfData | ReactFlowParallelData, handleId, side)
  }
  return undefined
}

function disallowedSource(nodeId: string, handleId: string): boolean {
  if (nodeId === EXECUTION_RETURNS_NODE_ID) return true
  if (handleId === LOOP_REF_HANDLE || handleId === LOOP_COLLECT_HANDLE) return true
  return false
}

function disallowedTarget(nodeId: string, handleId: string): boolean {
  if (nodeId === EXECUTION_RETURNS_NODE_ID) return true
  if (handleId === LOOP_REF_HANDLE || handleId === LOOP_COLLECT_HANDLE) return true
  return false
}

/**
 * Whether a data connection is allowed (compatibility and read order).
 * @category App
 */
export function isValidDataConnection(
  manifest: ExecutionManifest,
  document: ReactFlowDocument,
  connection: Connection,
): boolean {
  return dataConnectionRefusal(manifest, document, connection) === undefined
}

/**
 * Refusal reason for an invalid data drop, if any.
 * @category App
 */
export function dataConnectionRefusal(
  manifest: ExecutionManifest,
  document: ReactFlowDocument,
  connection: Connection,
): string | undefined {
  const source = connection.source
  const target = connection.target
  const sourceHandle = connection.sourceHandle
  const targetHandle = connection.targetHandle
  if (!source || !target || !sourceHandle || !targetHandle) return CONNECTION_EDIT_HANDLE
  if (!isDataHandle(sourceHandle) || !isDataHandle(targetHandle)) return CONNECTION_EDIT_HANDLE
  if (disallowedSource(source, sourceHandle) || disallowedTarget(target, targetHandle)) return CONNECTION_EDIT_HANDLE

  const sourcePort = portOnDocument(document, source, sourceHandle, "output")
  const targetPort = portOnDocument(document, target, targetHandle, "input")
  if (!sourcePort || !targetPort) return CONNECTION_EDIT_HANDLE
  if (!portsAreCompatible(sourcePort, targetPort)) return CONNECTION_EDIT_INCOMPATIBLE
  if (source === target) return CONNECTION_EDIT_SELF

  const detachedRoots = new Set((manifest.detached ?? []).map((node) => node.id))
  const exempt = detachedNodeIds(manifest)
  const targetOwner = loopIdFromEndMarker(target) ?? target
  if (exempt.has(targetOwner) && !detachedRoots.has(targetOwner)) {
    return CONNECTION_EDIT_NOT_STEP
  }
  if (detachedRoots.has(targetOwner)) {
    const root = (manifest.detached ?? []).find((node) => node.id === targetOwner)
    if (!root || !isStepNode(root)) return CONNECTION_EDIT_NOT_STEP
    if (exempt.has(source)) return CONNECTION_EDIT_SOURCE_DETACHED
    if (findStepPlacement(manifest.steps, target)) {
      return !sourceVisibleTo(manifest, { nodeId: source, handleId: sourceHandle }, target)
        ? CONNECTION_EDIT_ORDER
        : undefined
    }
    const placed = placementManifestForDetachedConnect(manifest, source, sourceHandle, target)
    if (!placed) return CONNECTION_EDIT_NOT_STEP
    return !sourceVisibleTo(placed, { nodeId: source, handleId: sourceHandle }, target)
      ? CONNECTION_EDIT_ORDER
      : undefined
  }

  if (!sourceVisibleTo(manifest, { nodeId: source, handleId: sourceHandle }, target)) return CONNECTION_EDIT_ORDER
  return undefined
}

/**
 * Build {@link ConnectInputTarget} from a React Flow connection.
 * @category App
 */
export function connectInputTarget(connection: Connection): ConnectInputTarget | undefined {
  const source = connection.source
  const target = connection.target
  const sourceHandle = connection.sourceHandle
  const targetHandle = connection.targetHandle
  if (!source || !target || !sourceHandle || !targetHandle) return undefined
  if (!isDataHandle(sourceHandle) || !isDataHandle(targetHandle)) return undefined
  return { sourceNodeId: source, sourceHandle, targetStepId: target, targetHandle }
}

export { CONNECTION_EDIT_INCOMPATIBLE, CONNECTION_EDIT_ORDER, CONNECTION_EDIT_SELF }
