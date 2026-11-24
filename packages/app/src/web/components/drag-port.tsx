import type { ReactFlowPort } from "../../graph/index.js"
import { InputPortRow, OutputPortRow, type PortDragState } from "./ports.js"
import { usePortDrag } from "./canvas-edit-context.js"

/**
 * Input port with drag highlighting (hooks-safe wrapper).
 * @category App
 */
export function DragInputPort({
  nodeId,
  port,
  connected,
  connectable,
}: {
  nodeId: string
  port: ReactFlowPort
  connected: boolean
  connectable: boolean
}) {
  const drag = usePortDrag(nodeId, port.id, "target")
  return <InputPortRow port={port} connected={connected} connectable={connectable} drag={drag} />
}

/**
 * Output port with drag highlighting (hooks-safe wrapper).
 * @category App
 */
export function DragOutputPort({
  nodeId,
  port,
  connected,
  connectable,
}: {
  nodeId: string
  port: ReactFlowPort
  connected: boolean
  connectable: boolean
}) {
  const drag = usePortDrag(nodeId, port.id, "source")
  return <OutputPortRow port={port} connected={connected} connectable={connectable} drag={drag} />
}

export type { PortDragState }