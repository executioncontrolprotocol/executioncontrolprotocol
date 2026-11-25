import type { SyntheticEvent } from "react"
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react"
import { useEdgeMenuActions } from "./edge-menu-context.js"
import { useRouteEdgeSelection } from "./route-edge-selection-context.js"

/**
 * Data edge from a `$ref` / `$state` / `$expr` read, an `expr` gate or a `returns` key.
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
  const selection = useRouteEdgeSelection()
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  const stopPointer = (event: SyntheticEvent): void => {
    event.stopPropagation()
  }

  const openMenu = (event: SyntheticEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    const mouse = event as unknown as { clientX: number; clientY: number }
    menu.openMenu(id, 0, mouse.clientX, mouse.clientY)
  }

  const visible = menu.hoveredEdgeId === id || (selection.selectedEdgeId === id && selection.selectedLevel === 0)

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