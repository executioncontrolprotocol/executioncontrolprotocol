import { Handle, Position } from "@xyflow/react"
import type { ReactFlowPort } from "../../graph/index.js"

function handleClass(kind: "input" | "output", connected: boolean): string {
  const state = connected ? "ecp-rf-handle--connected" : "ecp-rf-handle--idle"
  return `ecp-rf-handle !h-2.5 !w-2.5 !border-[1.5px] ${state} ecp-rf-handle--${kind}`
}

function BindingText({ port }: { port: ReactFlowPort }) {
  if (port.binding === "ref" && port.refPath) {
    return (
      <span className="text-tertiary-fixed-dim" title={port.refPath}>
        {" \u2190 "}
        {port.refPath}
        {port.refOptional ? "?" : ""}
      </span>
    )
  }
  if (port.binding === "script") {
    return (
      <span className="text-primary-fixed" title={port.valueTitle}>
        {" = script"}
        {port.scriptPath ? ` ${port.scriptPath}` : ""}
      </span>
    )
  }
  if (port.binding === "literal" && port.valuePreview !== undefined) {
    return (
      <span className="text-outline" title={port.valueTitle}>
        {" = "}
        {port.valuePreview}
      </span>
    )
  }
  return null
}

export type PortDragState = "compatible" | "incompatible" | "idle"

/**
 * Input port row with a target handle on the left.
 * @category App
 */
export function InputPortRow({
  port,
  connected,
  connectable = false,
  drag = "idle",
}: {
  port: ReactFlowPort
  connected: boolean
  connectable?: boolean
  drag?: PortDragState
}) {
  const allow = connectable && drag !== "incompatible"
  return (
    <div className="relative flex min-w-0 items-center gap-1 pl-2">
      <Handle
        type="target"
        position={Position.Left}
        id={port.id}
        className={`${handleClass("input", connected)}${drag === "incompatible" ? " ecp-rf-port--incompatible" : ""}${drag === "compatible" ? " ecp-rf-port--compatible" : ""}`}
        isConnectable={allow}
        isConnectableStart={allow}
        isConnectableEnd={allow}
        data-incompatible={drag === "incompatible" ? "true" : "false"}
      />
      <span className="min-w-0 truncate font-mono text-[10px] text-on-surface-variant">
        {port.name}
        <span className="text-outline">:{port.typeLabel}</span>
        <BindingText port={port} />
      </span>
    </div>
  )
}

/**
 * Output port row with a source handle on the right.
 * @category App
 */
export function OutputPortRow({
  port,
  connected,
  connectable = false,
  drag = "idle",
}: {
  port: ReactFlowPort
  connected: boolean
  connectable?: boolean
  drag?: PortDragState
}) {
  const allow = connectable && drag !== "incompatible"
  return (
    <div className="relative flex items-center justify-end pr-2">
      <span className="font-mono text-[10px] text-on-surface-variant">
        {port.name}
        <span className="text-outline">:{port.typeLabel}</span>
      </span>
      <Handle
        type="source"
        position={Position.Right}
        id={port.id}
        className={`${handleClass("output", connected)}${drag === "incompatible" ? " ecp-rf-port--incompatible" : ""}${drag === "compatible" ? " ecp-rf-port--compatible" : ""}`}
        isConnectable={allow}
        isConnectableStart={allow}
        isConnectableEnd={allow}
        data-incompatible={drag === "incompatible" ? "true" : "false"}
      />
    </div>
  )
}