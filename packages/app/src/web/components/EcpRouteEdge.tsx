import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react"
import type { ReactFlowArmRunState, ReactFlowRouteEdgeData } from "../../graph/index.js"

/**
 * Data for {@link EcpRouteEdge}: route metadata plus the run-time arm state.
 * @category App
 */
export interface EcpRouteEdgeData extends ReactFlowRouteEdgeData {
  /** Branch arm / loop highlight during or after a run. */
  armState?: ReactFlowArmRunState
}

/**
 * Text shown on a route edge: arm or structure label, `expr` text, loop `maxRounds`.
 * @category App
 */
export function routeEdgeLabel(data: ReactFlowRouteEdgeData): string {
  const parts: string[] = []
  if (data.label) parts.push(data.label)
  if (data.exprBadge) parts.push(data.exprBadge)
  if (data.route === "branch" && data.defaultArm && !data.label) parts.push("default")
  if (data.route === "loop" && data.maxRounds !== undefined) parts.push(`max ${data.maxRounds}`)
  return parts.join(" \u00b7 ")
}

/**
 * Structural route edge (branch arm, parallel line, loop entry or loop-back), dashed, with
 * a label at the bezier midpoint. Loop-back edges carry no label.
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
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const label = route && !route.loopBack ? routeEdgeLabel(route) : ""
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={interactionWidth} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="ecp-rf-edge-label"
            data-testid={`ecp-route-label-${id}`}
            title={label}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
