import type { SyntheticEvent } from "react"
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react"
import type { ReactFlowArmRunState, ReactFlowRouteEdgeData, ReactFlowRouteLevel } from "../../graph/index.js"
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
 * Text shown on a route edge pill: arm or structure label, `expr` text, loop `maxRounds`.
 * @category App
 */
export function routeEdgeLabel(data: ReactFlowRouteLevel): string {
  const parts: string[] = []
  if (data.label) parts.push(data.label)
  if (data.exprBadge) parts.push(data.exprBadge)
  if (data.route === "branch" && data.defaultArm && !data.label) parts.push("default")
  if (data.route === "loop" && data.maxRounds !== undefined) parts.push(`max ${data.maxRounds}`)
  return parts.join(" \u00b7 ")
}

/**
 * Structural route edge (branch arm, parallel line, loop entry or loop-back), dashed, with
 * one pill button per route level at the bezier midpoint and a ⋯ menu control per level.
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
  const hovered = menu.hoveredEdgeId === id

  const stopPointer = (event: SyntheticEvent): void => {
    event.stopPropagation()
  }

  const openMenu = (event: SyntheticEvent, level: number): void => {
    event.preventDefault()
    event.stopPropagation()
    const mouse = event as unknown as { clientX: number; clientY: number }
    menu.openMenu(id, level, mouse.clientX, mouse.clientY)
  }

  const showControl = (levelIndex: number): boolean => {
    return hovered || (selection.selectedEdgeId === id && selection.selectedLevel === levelIndex)
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
            {levels.map((level, index) => {
              const label = routeEdgeLabel(level)
              const selected = selection.selectedEdgeId === id && selection.selectedLevel === index
              const visible = showControl(index)
              return (
                <div key={index} className="ecp-rf-edge-level-row flex items-center gap-1">
                  {label.length > 0 ? (
                    <button
                      type="button"
                      className={`ecp-rf-edge-label nodrag nopan${selected ? " ecp-rf-edge-label--selected" : ""}`}
                      data-testid={`ecp-route-label-${id}`}
                      data-level={String(index)}
                      title={label}
                      onClick={(event) => {
                        stopPointer(event)
                        selection.select(id, index)
                      }}
                      onPointerDown={stopPointer}
                      onContextMenu={(event) => openMenu(event, index)}
                    >
                      {label}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`ecp-rf-edge-menu nodrag nopan${visible ? "" : " ecp-rf-edge-menu--hidden"}`}
                    data-testid={`ecp-edge-menu-${id}`}
                    data-level={String(index)}
                    aria-label="Edge menu"
                    onClick={(event) => openMenu(event, index)}
                    onContextMenu={(event) => openMenu(event, index)}
                    onPointerDown={stopPointer}
                  >
                    ⋯
                  </button>
                </div>
              )
            })}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}