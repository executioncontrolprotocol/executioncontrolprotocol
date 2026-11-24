import { Handle, Position } from "@xyflow/react"
import type { ReactFlowPort } from "../../graph/index.js"
import { FLOW_IN_HANDLE, FLOW_OUT_HANDLE } from "../../graph/index.js"

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
  if (port.binding === "expr") {
    return (
      <span className="text-primary-fixed" title={port.valueTitle ?? port.exprSource}>
        {" = expr"}
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

/** Flow handles sit on the node border, level with the node title. */
const FLOW_HANDLE_TOP = 16

function flowHandleClass(): string {
  return "ecp-rf-handle ecp-rf-handle--flow !h-2 !w-2 !border"
}

/**
 * Target handle for structural route edges (left border, level with the node title).
 * @category App
 */
export function FlowInHandle({ connectable = false }: { connectable?: boolean }) {
  return (
    <Handle
      type="target"
      position={Position.Left}
      id={FLOW_IN_HANDLE}
      className={flowHandleClass()}
      style={{ top: FLOW_HANDLE_TOP, pointerEvents: connectable ? "auto" : undefined }}
      isConnectable={connectable}
      isConnectableStart={connectable}
      isConnectableEnd={connectable}
    />
  )
}

/**
 * Source handle for structural route edges (right border, level with the node title).
 * @category App
 */
export function FlowOutHandle({ connectable = false }: { connectable?: boolean }) {
  return (
    <Handle
      type="source"
      position={Position.Right}
      id={FLOW_OUT_HANDLE}
      className={flowHandleClass()}
      style={{ top: FLOW_HANDLE_TOP, pointerEvents: connectable ? "auto" : undefined }}
      isConnectable={connectable}
      isConnectableStart={connectable}
      isConnectableEnd={connectable}
    />
  )
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
