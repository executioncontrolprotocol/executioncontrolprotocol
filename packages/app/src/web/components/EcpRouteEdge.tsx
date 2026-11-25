import type { SyntheticEvent } from "react"
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react"
import type { ReactFlowArmRunState, ReactFlowRouteEdgeData } from "../../graph/index.js"
import { routeDeleteTarget, routeEdgeLabel } from "../../graph/index.js"
import { useEdgeMenuActions } from "./edge-menu-context.js"
import { useRouteEdgeSelection } from "./route-edge-selection-context.js"

/**
 * Data for {@link EcpRouteEdge}: route metadata plus the run-time arm state.
 * @category App
 */
export interface EcpRouteEdgeData extends ReactFlowRouteEdgeData {
  /** Branch arm / loop highlight during or after a run. */
  armState?: ReactFlowArmRunState
}

/**
 * Structural route edge (branch arm, parallel line, loop entry or loop-back), dashed, with
 * at most one label pill and one menu control per connector.
 * @category App
 */
export function EcpRouteEdge({
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
  data,
}: EdgeProps) {
  const route = data as unknown as EcpRouteEdgeData | undefined
  const selection = useRouteEdgeSelection()
  const menu = useEdgeMenuActions()
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  if (!route || route.loopBack) {
    return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={interactionWidth} />
  }

  const levels = route.levels
  const pillText = routeEdgeLabel(levels)
  const deleteLevel = routeDeleteTarget(levels) ?? 0
  const hovered = menu.hoveredEdgeId === id
  const selected = selection.selectedEdgeId === id
  const showMenu = hovered || selected

  const stopPointer = (event: SyntheticEvent): void => {
    event.stopPropagation()
  }

  const selectEdge = (): void => {
    selection.select(id, deleteLevel)
  }

  const openMenu = (event: SyntheticEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    const mouse = event as unknown as { clientX: number; clientY: number }
    menu.openMenu(id, deleteLevel, mouse.clientX, mouse.clientY)
  }

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={interactionWidth} />
      {levels.length > 0 ? (
        <EdgeLabelRenderer>
          <div
            className="ecp-rf-edge-label-stack"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {pillText.length > 0 ? (
              <button
                type="button"
                className={`ecp-rf-edge-label nodrag nopan${selected ? " ecp-rf-edge-label--selected" : ""}`}
                data-testid={`ecp-route-label-${id}`}
                title={pillText}
                onClick={(event) => {
                  stopPointer(event)
                  selectEdge()
                }}
                onPointerDown={stopPointer}
                onContextMenu={openMenu}
              >
                {pillText}
              </button>
            ) : null}
            <button
              type="button"
              className={`ecp-rf-edge-menu nodrag nopan${showMenu ? "" : " ecp-rf-edge-menu--hidden"}`}
              data-testid={`ecp-edge-menu-${id}`}
              aria-label="Edge menu"
              onClick={openMenu}
              onContextMenu={openMenu}
              onPointerDown={stopPointer}
            >
              ⋯
            </button>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}