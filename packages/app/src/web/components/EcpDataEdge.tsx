import type { SyntheticEvent } from "react"
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react"
import { composeBranchPath, pathMidpoint } from "../../graph/branch-routing.js"
import { useBranchRoute } from "./branch-routing-context.js"
import { useEdgeMenuActions } from "./edge-menu-context.js"

/**
 * Data branch from a producing port to a step input `$ref`.
 * @category App
 */
export function EcpDataEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  interactionWidth,
}: EdgeProps) {
  const menu = useEdgeMenuActions()
  const routedMiddle = useBranchRoute(id)
  const [bezierPath, bezierLabelX, bezierLabelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const path = routedMiddle
    ? composeBranchPath(sourceX, sourceY, targetX, targetY, routedMiddle)
    : bezierPath
  const mid = routedMiddle ? pathMidpoint(path) : { x: bezierLabelX, y: bezierLabelY }
  const labelX = mid.x
  const labelY = mid.y

  const stopPointer = (event: SyntheticEvent): void => {
    event.stopPropagation()
  }

  const openMenu = (event: SyntheticEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    const mouse = event as unknown as { clientX: number; clientY: number }
    menu.openMenu(id, mouse.clientX, mouse.clientY)
  }

  const visible = menu.hoveredEdgeId === id || menu.selectedEdgeId === id

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={interactionWidth} />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={`ecp-rf-edge-menu nodrag nopan${visible ? "" : " ecp-rf-edge-menu--hidden"}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          data-testid={`ecp-edge-menu-${id}`}
          aria-label="Edge menu"
          onClick={openMenu}
          onContextMenu={openMenu}
          onPointerDown={stopPointer}
        >
          ⋯
        </button>
      </EdgeLabelRenderer>
    </>
  )
}