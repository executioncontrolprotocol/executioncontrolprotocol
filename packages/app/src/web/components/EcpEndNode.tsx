import type { NodeProps } from "@xyflow/react"
import type { ReactFlowEndData } from "../../graph/index.js"

interface EcpEndNodeData extends ReactFlowEndData {
  dataConnectable?: boolean
  round?: number
}

/**
 * View-only React Flow node for a control `end` (no ports).
 * @category App
 */
export function EcpEndNode({ id, data, selected }: NodeProps) {
  const node = data as unknown as EcpEndNodeData
  return (
    <div
      data-testid={`ecp-end-${id}`}
      data-selected={selected ? "true" : "false"}
      data-structure-kind={node.structureKind}
      className={[
        "ecp-rf-end inline-flex min-w-[72px] items-center justify-center rounded-full border border-outline-variant bg-surface-container-low px-3 py-1 shadow-sm",
        selected ? "ecp-rf-node--selected" : "",
        node.detached ? "ecp-rf-node--detached" : "",
      ].join(" ")}
    >
      <span className="font-display text-[10px] font-semibold text-on-surface-variant">{node.label}</span>
      {node.round !== undefined ? (
        <span className="ml-1 font-mono text-[9px] text-on-surface-variant" data-testid="ecp-end-round">
          r{node.round + 1}
        </span>
      ) : null}
    </div>
  )
}