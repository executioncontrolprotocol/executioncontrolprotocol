import type { NodeProps } from "@xyflow/react"
import { GitBranch } from "lucide-react"
import type { ReactFlowIfData } from "../../graph/index.js"
import { DragInputPort, DragOutputPort } from "./drag-port.js"

interface EcpIfNodeData extends ReactFlowIfData {
  dataConnectable?: boolean
  connectedTargetHandles?: string[]
  connectedSourceHandles?: string[]
  /** Taken side from `if.select` during a run overlay (`null` = neither). */
  choiceSide?: "then" | "else" | null
}

/**
 * View-only React Flow node for an `if` condition.
 * @category App
 */
export function EcpIfNode({ id, data, selected }: NodeProps) {
  const node = data as unknown as EcpIfNodeData
  const targets = new Set(node.connectedTargetHandles ?? [])
  const sources = new Set(node.connectedSourceHandles ?? [])
  const dataConnectable = node.dataConnectable ?? false
  return (
    <div
      data-testid={`ecp-if-${id}`}
      data-selected={selected ? "true" : "false"}
      data-choice-side={node.choiceSide ?? ""}
      className={[
        "ecp-rf-node min-w-[200px] rounded-lg border border-outline-variant bg-surface-container px-3 py-2 shadow-sm",
        selected ? "ecp-rf-node--selected" : "",
        node.detached ? "ecp-rf-node--detached" : "",
        node.choiceSide === "then" ? "ecp-rf-if--then" : "",
        node.choiceSide === "else" ? "ecp-rf-if--else" : "",
        node.choiceSide === null ? "ecp-rf-if--none" : "",
      ].join(" ")}
    >
      {node.detached ? (
        <span className="ecp-rf-detached-badge" data-testid={`ecp-detached-${id}`}>
          disconnected
        </span>
      ) : null}
      <div className="mb-2 flex items-center gap-1 font-display text-[11px] font-semibold text-on-surface">
        <GitBranch className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
        {node.label}
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