import type { NodeProps } from "@xyflow/react"
import { GitBranch, Repeat, Split } from "lucide-react"
import type { ReactFlowControlData } from "../../graph/index.js"
import { IF_ELSE_HANDLE, IF_THEN_HANDLE, PARALLEL_PATH_HANDLE_PREFIX } from "../../graph/types.js"
import { DragInputPort, DragOutputPort } from "./drag-port.js"

interface EcpControlNodeData extends ReactFlowControlData {
  dataConnectable?: boolean
  connectedTargetHandles?: string[]
  connectedSourceHandles?: string[]
  /** Taken side from `if.select` during a run overlay (`null` = neither). */
  choiceSide?: "then" | "else" | null
  done?: number
  count?: number
  round?: number
}

function kindLabel(kind: ReactFlowControlData["controlKind"]): string {
  if (kind === "if") return "if"
  if (kind === "forEach") return "for each"
  if (kind === "for") return "for"
  return "parallel"
}

function KindIcon({ kind }: { kind: ReactFlowControlData["controlKind"] }) {
  if (kind === "if") return <GitBranch className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
  if (kind === "parallel") return <Split className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
  return <Repeat className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
}

function outputHandleClass(controlKind: ReactFlowControlData["controlKind"], portId: string): string {
  if (controlKind === "if") {
    if (portId === IF_THEN_HANDLE) return "ecp-rf-handle--tunnel-then"
    if (portId === IF_ELSE_HANDLE) return "ecp-rf-handle--tunnel-else"
  }
  if (controlKind === "parallel" && portId.startsWith(PARALLEL_PATH_HANDLE_PREFIX)) {
    return "ecp-rf-handle--tunnel-path"
  }
  return ""
}

/**
 * Unified view-only React Flow node for `if`, `loop`, and `parallel` control nodes.
 * @category App
 */
export function EcpControlNode({ id, data, selected }: NodeProps) {
  const node = data as unknown as EcpControlNodeData
  const targets = new Set(node.connectedTargetHandles ?? [])
  const sources = new Set(node.connectedSourceHandles ?? [])
  const dataConnectable = node.dataConnectable ?? false
  const truncatedExpression =
    node.expression && node.expression.length > 48 ? `${node.expression.slice(0, 45)}…` : node.expression

  const legacyTestId =
    node.controlKind === "if" ? `ecp-if-${id}` : node.controlKind === "parallel" ? `ecp-parallel-${id}` : `ecp-loop-${id}`

  return (
    <div
      data-testid={legacyTestId}
      data-selected={selected ? "true" : "false"}
      data-control-kind={node.controlKind}
      data-choice-side={node.choiceSide ?? ""}
      className={[
        "ecp-rf-node min-w-[200px] rounded-lg border bg-surface-container px-3 py-2 shadow-sm",
        node.controlKind === "for" || node.controlKind === "forEach"
          ? "ecp-rf-control--loop border-[#a371f7]"
          : node.controlKind === "parallel"
            ? "ecp-rf-control--parallel border-[#58a6ff]"
            : "border-outline-variant",
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
      <div className="mb-1 font-mono text-[9px] uppercase text-on-surface-variant">Kind: {kindLabel(node.controlKind)}</div>
      <div className="mb-2 flex items-center gap-1 font-display text-[11px] font-semibold text-on-surface">
        <KindIcon kind={node.controlKind} />
        {node.label}
      </div>
      {node.controlKind === "if" && truncatedExpression ? (
        <p className="mb-2 truncate font-mono text-[10px] text-on-surface-variant" title={node.expression}>
          {truncatedExpression}
        </p>
      ) : null}
      {node.controlKind === "forEach" && node.count !== undefined ? (
        <div className="mb-1 font-mono text-[9px] text-on-surface-variant" data-testid="ecp-loop-progress">
          {node.done ?? 0} / {node.count}
        </div>
      ) : null}
      {node.round !== undefined ? (
        <div className="mb-1 font-mono text-[9px] text-on-surface-variant" data-testid="ecp-loop-round">
          round {node.round + 1}
        </div>
      ) : null}
      <div className="mt-2 space-y-1">
        {node.inputs.map((port) => (
          <DragInputPort nodeId={id} key={port.id} port={port} connected={targets.has(port.id)} connectable={dataConnectable} />
        ))}
        {node.outputs.map((port) => (
          <DragOutputPort
            nodeId={id}
            key={port.id}
            port={port}
            connected={sources.has(port.id)}
            connectable={dataConnectable}
            handleClassName={outputHandleClass(node.controlKind, port.id)}
          />
        ))}
      </div>
    </div>
  )
}