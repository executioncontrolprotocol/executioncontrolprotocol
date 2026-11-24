import type { NodeProps } from "@xyflow/react"
import type { ReactFlowIoData } from "../../graph/index.js"
import { FlowInHandle, FlowOutHandle, InputPortRow, OutputPortRow } from "./ports.js"

/**
 * Data for {@link EcpIoNode}.
 * @category App
 */
export interface EcpIoNodeData extends ReactFlowIoData {
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
  const targets = new Set(io.connectedTargetHandles ?? [])
  const sources = new Set(io.connectedSourceHandles ?? [])
  return (
    <div
      data-testid={`ecp-io-${io.kind}`}
      data-node-id={id}
      className="ecp-rf-node ecp-rf-node--io min-w-[180px] rounded-lg border border-outline-variant bg-surface-container px-3 py-2 shadow-sm"
    >
      {io.kind === "returns" ? <FlowInHandle /> : null}
      {io.kind === "accepts" ? <FlowOutHandle /> : null}
      <div className="mb-2">
        <div className="font-display text-[11px] font-semibold leading-tight text-on-surface">{io.label}</div>
        <div className="mt-1 font-mono text-[10px] text-on-surface-variant">execution.{io.kind}</div>
      </div>
      <div className="flex flex-col gap-1">
        {io.inputs.map((port) => (
          <InputPortRow
            key={`in-${port.id}`}
            port={port}
            connected={port.binding === "ref" || targets.has(port.id)}
          />
        ))}
        {io.outputs.map((port) => (
          <OutputPortRow key={`out-${port.id}`} port={port} connected={sources.has(port.id)} />
        ))}
        {io.inputs.length === 0 && io.outputs.length === 0 ? (
          <p className="font-mono text-[10px] text-outline">No parameters</p>
        ) : null}
      </div>
    </div>
  )
}
