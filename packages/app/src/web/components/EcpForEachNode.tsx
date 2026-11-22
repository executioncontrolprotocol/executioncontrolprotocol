import type { NodeProps } from "@xyflow/react"
import { Repeat } from "lucide-react"
import type { ReactFlowForEachData } from "../../graph/index.js"
import { InputPortRow, OutputPortRow } from "./ports.js"

/**
 * Data for {@link EcpForEachNode}: structure metadata plus run overlay counts.
 * @category App
 */
export interface EcpForEachNodeData extends ReactFlowForEachData {
  /** Items finished so far. */
  done?: number
  /** Total item count. */
  count?: number
  /** Input port ids with an incoming data edge. */
  connectedTargetHandles?: string[]
  /** Output port ids with an outgoing data edge. */
  connectedSourceHandles?: string[]
}

/**
 * View-only React Flow node for a `forEach` structure: refs, concurrency and run counts.
 * @category App
 */
export function EcpForEachNode({ id, data, selected }: NodeProps) {
  const node = data as unknown as EcpForEachNodeData
  const targets = new Set(node.connectedTargetHandles ?? [])
  const sources = new Set(node.connectedSourceHandles ?? [])
  const classes = [
    "ecp-rf-node min-w-[200px] rounded-lg border border-outline-variant bg-surface-container px-3 py-2 shadow-sm",
    selected ? "ecp-rf-node--selected" : "",
  ]

  return (
    <div
      data-testid={`ecp-foreach-${id}`}
      data-selected={selected ? "true" : "false"}
      className={classes.join(" ")}
    >
      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 font-display text-[11px] font-semibold leading-tight text-on-surface">
            <Repeat className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
            {node.label}
          </div>
          <div className="mt-1 font-mono text-[10px] text-on-surface-variant">
            as {node.as} → {node.into}
          </div>
          <div className="mt-1 font-mono text-[9px] text-on-surface-variant">
            ×{node.concurrency}
            {node.throttle ? ` · throttle ${node.throttle.starts}/${node.throttle.perSeconds}s` : ""}
            {node.onError === "continue" ? " · onError: continue" : ""}
          </div>
          {node.count !== undefined ? (
            <div className="mt-1 font-mono text-[9px] text-on-surface-variant" data-testid="ecp-foreach-progress">
              {node.done ?? 0} / {node.count}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {node.inputs.map((port) => (
          <InputPortRow key={`in-${port.id}`} port={port} connected={port.binding === "ref" || targets.has(port.id)} />
        ))}
        {node.outputs.map((port) => (
          <OutputPortRow key={`out-${port.id}`} port={port} connected={sources.has(port.id)} />
        ))}
      </div>
    </div>
  )
}