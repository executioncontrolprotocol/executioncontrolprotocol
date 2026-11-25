import type { MouseEvent } from "react"
import type { NodeProps } from "@xyflow/react"
import { Columns2, Ellipsis, GitBranch, Repeat } from "lucide-react"
import type { ReactFlowFrameData } from "../../graph/index.js"
import { FlowInHandle } from "./ports.js"
import { useFrameActions } from "./frame-actions-context.js"

function FrameIcon({ data }: { data: ReactFlowFrameData }) {
  const className = "h-3.5 w-3.5 shrink-0 text-on-surface-variant"
  if (data.structureKind === "branch") return <GitBranch className={className} aria-hidden="true" />
  if (data.structureKind === "parallel") return <Columns2 className={className} aria-hidden="true" />
  return <Repeat className={className} aria-hidden="true" />
}

/**
 * Decorative frame around a branch, parallel, or loop (not a dagre parent).
 * @category App
 */
export function EcpFrameNode({ data }: NodeProps) {
  const frame = data as unknown as ReactFlowFrameData & { flowConnectable?: boolean }
  const actions = useFrameActions()
  const selected = actions.selectedStructureId === frame.structureId

  const openMenu = (event: MouseEvent, structureId: string) => {
    event.preventDefault()
    event.stopPropagation()
    actions.onOpenMenu(structureId, event.clientX, event.clientY)
  }

  return (
    <div
      className="ecp-rf-frame"
      data-testid={`ecp-frame-${frame.structureId}`}
      data-kind={frame.structureKind}
      data-selected={selected ? "true" : "false"}
      style={{ width: "100%", height: "100%" }}
    >
      <div
        className="ecp-rf-frame-header nodrag nopan"
        data-testid={`ecp-frame-label-${frame.structureId}`}
        style={{ pointerEvents: "auto" }}
        onClick={(event) => {
          event.stopPropagation()
          actions.onHeaderClick(frame.structureId)
        }}
        onContextMenu={(event) => openMenu(event, frame.structureId)}
      >
        <FlowInHandle connectable={frame.flowConnectable ?? false} />
        <FrameIcon data={frame} />
        <span className="ecp-rf-frame-label-text">{frame.label ?? frame.structureKind}</span>
        {frame.detached ? (
          <span className="ecp-rf-detached-badge" data-testid={`ecp-detached-${frame.structureId}`}>
            disconnected
          </span>
        ) : null}
        <button
          type="button"
          className="ecp-rf-frame-menu nodrag nopan"
          style={{ pointerEvents: "auto" }}
          data-testid={`ecp-frame-menu-${frame.structureId}`}
          aria-label="Structure menu"
          onClick={(event) => openMenu(event, frame.structureId)}
          onContextMenu={(event) => openMenu(event, frame.structureId)}
        >
          <Ellipsis className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}