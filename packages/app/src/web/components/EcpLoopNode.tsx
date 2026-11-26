import type { NodeProps } from "@xyflow/react"
import { Repeat } from "lucide-react"
import type { ReactFlowLoopItemsData } from "../../graph/index.js"
import { DragInputPort, DragOutputPort } from "./drag-port.js"

/**
 * Data for {@link EcpLoopNode}: structure metadata plus run overlay counts.
 * @category App
 */
export interface EcpLoopNodeData extends ReactFlowLoopItemsData {
  dataConnectable?: boolean
  /** Items finished so far (`forEach`). */
  done?: number
  /** Total item count (`forEach`). */
  count?: number
  /** Current round (`for`). */
  round?: number
  /** Input port ids with an incoming data edge. */
  connectedTargetHandles?: string[]
  /** Output port ids with an outgoing data edge. */
  connectedSourceHandles?: string[]
}

/**
 * View-only React Flow node for loop structure heads (all loop modes).
 * @category App
 */
export function EcpLoopNode({ id, data, selected }: NodeProps) {
  const node = data as unknown as EcpLoopNodeData
  const dataConnectable = node.dataConnectable ?? false
  const targets = new Set(node.connectedTargetHandles ?? [])
  const sources = new Set(node.connectedSourceHandles ?? [])
  const classes = [
    "ecp-rf-node min-w-[200px] rounded-lg border border-outline-variant bg-surface-container px-3 py-2 shadow-sm",
    selected ? "ecp-rf-node--selected" : "",
    node.detached ? "ecp-rf-node--detached" : "",
  ]
  const mode = node.mode ?? "for"

  return (
    <div
      data-testid={`ecp-loop-${id}`}
      data-selected={selected ? "true" : "false"}
      className={classes.join(" ")}
    >
      {node.detached ? (
        <span className="ecp-rf-detached-badge" data-testid={`ecp-detached-${id}`}>
          disconnected
        </span>
      ) : null}
      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 font-display text-[11px] font-semibold leading-tight text-on-surface">
            <Repeat className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
            {node.label}
          </div>
          {node.as ? (
            <div className="mt-1 font-mono text-[10px] text-on-surface-variant">as {node.as}</div>
          ) : null}
          <div className="mt-1 font-mono text-[9px] text-on-surface-variant">
            {mode}
            {mode === "forEach" ? ` · ×${node.concurrency ?? 1}` : ""}
            {mode === "forEach" && node.onError === "continue" ? " · onError: continue" : ""}
          </div>
          {node.count !== undefined ? (
            <div className="mt-1 font-mono text-[9px] text-on-surface-variant" data-testid="ecp-loop-progress">
              {node.done ?? 0} / {node.count}
            </div>
          ) : null}
          {node.round !== undefined ? (
            <div className="mt-1 font-mono text-[9px] text-on-surface-variant" data-testid="ecp-loop-round">
              round {node.round + 1}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {node.inputs.map((port) => (
          <DragInputPort
            key={`in-${port.id}`}
            nodeId={id}
            port={port}
            connected={port.binding === "ref" || targets.has(port.id)}
            connectable={dataConnectable}
          />
        ))}
        {node.outputs.map((port) => (
          <DragOutputPort
            key={`out-${port.id}`}
            nodeId={id}
            port={port}
            connected={sources.has(port.id)}
            connectable={dataConnectable}
          />
        ))}
      </div>
    </div>
  )
}
