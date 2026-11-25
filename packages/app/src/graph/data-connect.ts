import type { Connection } from "@xyflow/react"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import {
  CONNECTION_EDIT_HANDLE,
  CONNECTION_EDIT_INCOMPATIBLE,
  CONNECTION_EDIT_ORDER,
  CONNECTION_EDIT_SELF,
  type ConnectInputTarget,
} from "./connection-edit.js"
import { portsAreCompatible } from "./port-compat.js"
import { sourceVisibleTo } from "./read-order.js"
import { EXECUTION_RETURNS_NODE_ID } from "./io-from-schema.js"
import { EXPR_HANDLE_ID } from "./extract-data-edges.js"
import {
  FLOW_IN_HANDLE,
  FLOW_OUT_HANDLE,
  LOOP_COLLECT_HANDLE,
  LOOP_REF_HANDLE,
  type ReactFlowDocument,
  type ReactFlowIoData,
  type ReactFlowLoopItemsData,
  type ReactFlowPort,
  type ReactFlowStepData,
} from "./types.js"

/**
 * Whether a handle id is a data port (not a flow handle).
 * @category App
 */
export function isDataHandle(handleId: string | null | undefined): boolean {
  if (!handleId) return false
  return handleId !== FLOW_IN_HANDLE && handleId !== FLOW_OUT_HANDLE
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

function loopPort(
  data: ReactFlowLoopItemsData,
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
  if (node.type === "ecp-loop") return loopPort(node.data as ReactFlowLoopItemsData, handleId, side)
  return undefined
}

function disallowedSource(nodeId: string, handleId: string): boolean {
  if (nodeId === EXECUTION_RETURNS_NODE_ID) return true
  if (handleId === EXPR_HANDLE_ID || handleId === LOOP_REF_HANDLE || handleId === LOOP_COLLECT_HANDLE) return true
  return false
}

function disallowedTarget(nodeId: string, handleId: string): boolean {
  if (nodeId === EXECUTION_RETURNS_NODE_ID) return true
  if (handleId === EXPR_HANDLE_ID || handleId === LOOP_REF_HANDLE || handleId === LOOP_COLLECT_HANDLE) return true
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