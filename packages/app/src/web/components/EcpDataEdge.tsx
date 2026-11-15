import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react"

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
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={interactionWidth} />
}
