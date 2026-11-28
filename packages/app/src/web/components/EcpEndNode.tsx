import type { NodeProps } from "@xyflow/react"
import type { EndMarkerSide, ReactFlowEndData } from "../../graph/index.js"

interface EcpEndNodeData extends ReactFlowEndData {
  dataConnectable?: boolean
  round?: number
  dimmed?: boolean
}

const END_SIDE_CLASS: Partial<Record<EndMarkerSide, string>> = {
  then: "ecp-rf-end--then",
  else: "ecp-rf-end--else",
  loop: "ecp-rf-end--loop",
}

function sideClass(side: EndMarkerSide): string {
  if (side === "then" || side === "else" || side === "loop") return END_SIDE_CLASS[side] ?? ""
  if (side.startsWith("path-")) return "ecp-rf-end--path"
  return ""
}

/**
 * View-only React Flow node for an end marker (no ports).
 * @category App
 */
export function EcpEndNode({ id, data, selected }: NodeProps) {
  const node = data as unknown as EcpEndNodeData
  return (
    <div
      data-testid={`ecp-end-${id}`}
      data-selected={selected ? "true" : "false"}
      data-structure-kind={node.structureKind}
      data-end-side={node.side}
      className={[
        "ecp-rf-end inline-flex min-w-[72px] items-center justify-center rounded-full border px-3 py-1 shadow-sm",
        sideClass(node.side),
        selected ? "ecp-rf-node--selected" : "",
        node.detached ? "ecp-rf-node--detached" : "",
        node.dimmed ? "ecp-rf-node--dimmed" : "",
      ].join(" ")}
    >
      <span className="font-display text-[10px] font-semibold">{node.label}</span>
      {node.round !== undefined ? (
        <span className="ml-1 font-mono text-[9px] text-on-surface-variant" data-testid="ecp-end-round">
          r{node.round + 1}
        </span>
      ) : null}
    </div>
  )
}