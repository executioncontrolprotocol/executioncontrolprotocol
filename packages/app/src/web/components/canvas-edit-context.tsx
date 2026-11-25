import { createContext, useContext, useMemo } from "react"
import { useConnection, type ConnectionState } from "@xyflow/react"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import {
  dataConnectionRefusal,
  isDataHandle,
  type ReactFlowDocument,
} from "../../graph/index.js"
import type { DataConnectDrag } from "./data-connect-context.js"

/**
 * Manifest and encoded graph for in-canvas connection edits.
 * @category App
 */
export interface CanvasEditContextValue {
  manifest: ExecutionManifest
  document: ReactFlowDocument
}

/**
 * Supplies the open execution to node components inside React Flow.
 * @category App
 */
export const CanvasEditContext = createContext<CanvasEditContextValue | undefined>(undefined)

function connectionEnds(
  state: ConnectionState,
  nodeId: string,
  handleId: string,
  handleType: "source" | "target",
): { source: string; sourceHandle: string; target: string; targetHandle: string } | undefined {
  if (!state.inProgress || !state.fromNode || !state.fromHandle) return undefined
  const from = state.fromNode
  const fromHandle = state.fromHandle
  if (!isDataHandle(fromHandle.id)) return undefined
  if (from.id === nodeId && fromHandle.id === handleId) return undefined

  if (fromHandle.type === "source") {
    if (handleType !== "target") return undefined
    return { source: from.id, sourceHandle: fromHandle.id ?? "", target: nodeId, targetHandle: handleId }
  }
  if (handleType !== "source") return undefined
  return { source: nodeId, sourceHandle: handleId, target: from.id, targetHandle: fromHandle.id ?? "" }
}

/**
 * Highlight for one port while a data connection is dragged.
 * @category App
 */
export function usePortDrag(nodeId: string, handleId: string, handleType: "source" | "target"): DataConnectDrag {
  const canvas = useContext(CanvasEditContext)
  const drag = useConnection((state) => (state.inProgress ? state : null))
  return useMemo(() => {
    if (!canvas || !drag) return "idle"
    const ends = connectionEnds(drag, nodeId, handleId, handleType)
    if (!ends) return "idle"
    const reason = dataConnectionRefusal(canvas.manifest, canvas.document, {
      source: ends.source,
      target: ends.target,
      sourceHandle: ends.sourceHandle,
      targetHandle: ends.targetHandle,
    })
    return reason ? "incompatible" : "compatible"
  }, [canvas, drag, handleId, handleType, nodeId])
}