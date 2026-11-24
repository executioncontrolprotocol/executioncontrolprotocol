import type { NodeProps } from "@xyflow/react"
import type { ReactFlowIoData } from "../../graph/index.js"
import { FlowInHandle, FlowOutHandle } from "./ports.js"
import { DragInputPort, DragOutputPort } from "./drag-port.js"

/**
 * Data for {@link EcpIoNode}.
 * @category App
 */
export interface EcpIoNodeData extends ReactFlowIoData {
  dataConnectable?: boolean
  /** Input port ids with an incoming data edge. */
  connectedTargetHandles?: string[]
  /** Output port ids with an outgoing data edge. */
  connectedSourceHandles?: string[]
}

/**
 * View-only projected Inputs (`execution.accepts`) or Outputs (`execution.returns`) node.
 * @category App
 */
export function EcpIoNode({ id, data }: NodeProps) {
  const io = data as unknown as EcpIoNodeData
  const dataConnectable = io.dataConnectable ?? false
  const targets = new Set(io.connectedTargetHandles ?? [])
  const sources = new Set(io.connectedSourceHandles ?? [])
  return (
    <div
      data-testid={`ecp-io-${io.kind}`}
      data-node-id={id}
      className="ecp-rf-node ecp-rf-node--io min-w-[180px] rounded-lg border border-outline-variant bg-surface-container px-3 py-2 shadow-sm"
    >
      {io.kind === "returns" ? <FlowInHandle connectable={(data as { flowConnectable?: boolean }).flowConnectable ?? false} /> : null}
      {io.kind === "accepts" ? (
        <FlowOutHandle connectable={(data as { flowConnectable?: boolean }).flowConnectable ?? false} />
      ) : null}
      <div className="mb-2">
        <div className="font-display text-[11px] font-semibold leading-tight text-on-surface">{io.label}</div>
        <div className="mt-1 font-mono text-[10px] text-on-surface-variant">execution.{io.kind}</div>
      </div>
      <div className="flex flex-col gap-1">
        {io.inputs.map((port) => (
          <DragInputPort
            key={`in-${port.id}`}
            nodeId={id}
            port={port}
            connected={port.binding === "ref" || targets.has(port.id)}
            connectable={false}
          />
        ))}
        {io.outputs.map((port) => (
          <DragOutputPort
            key={`out-${port.id}`}
            nodeId={id}
            port={port}
            connected={sources.has(port.id)}
            connectable={dataConnectable && io.kind === "accepts"}
          />
        ))}
        {io.inputs.length === 0 && io.outputs.length === 0 ? (
          <p className="font-mono text-[10px] text-outline">No parameters</p>
        ) : null}
      </div>
    </div>
  )
}
