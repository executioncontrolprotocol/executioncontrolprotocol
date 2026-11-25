import type { NodeProps } from "@xyflow/react"
import { CornerDownLeft } from "lucide-react"
import type { ReactFlowEndData } from "../../graph/index.js"
import { DragInputPort, DragOutputPort } from "./drag-port.js"

interface EcpEndNodeData extends ReactFlowEndData {
  dataConnectable?: boolean
  connectedTargetHandles?: string[]
  connectedSourceHandles?: string[]
}

/**
 * View-only React Flow node for a loop `end`.
 * @category App
 */
export function EcpEndNode({ id, data, selected }: NodeProps) {
  const node = data as unknown as EcpEndNodeData
  const targets = new Set(node.connectedTargetHandles ?? [])
  const sources = new Set(node.connectedSourceHandles ?? [])
  const dataConnectable = node.dataConnectable ?? false
  return (
    <div
      data-testid={`ecp-end-${id}`}
      data-selected={selected ? "true" : "false"}
      className={[
        "ecp-rf-node min-w-[160px] rounded-lg border border-dashed border-outline-variant bg-surface-container-low px-3 py-2 shadow-sm",
        selected ? "ecp-rf-node--selected" : "",
        node.detached ? "ecp-rf-node--detached" : "",
      ].join(" ")}
    >
      <div className="mb-2 flex items-center gap-1 font-display text-[11px] font-semibold text-on-surface-variant">
        <CornerDownLeft className="h-3 w-3 shrink-0" aria-hidden="true" />
        end
      </div>
      <div className="mt-2 space-y-1">
        {node.inputs.map((port) => (
          <DragInputPort nodeId={id} key={port.id} port={port} connected={targets.has(port.id)} connectable={dataConnectable} />
        ))}
        {node.outputs.map((port) => (
          <DragOutputPort nodeId={id} key={port.id} port={port} connected={sources.has(port.id)} connectable={dataConnectable} />
        ))}
      </div>
    </div>
  )
}