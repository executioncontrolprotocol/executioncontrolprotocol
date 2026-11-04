import { useContext, useEffect } from "react"
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react"
import { ReactFlowEdgeControlRegistryContext } from "./reactflow-edge-control-registry.js"
import { ReactFlowRouteHoverRegistryContext } from "./reactflow-route-hover-registry.js"

/** Structural route edge; mid-path menu + hover pill overlays track the bezier midpoint. */
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
  markerStart,
  interactionWidth,
  selected,
  target,
  data,
}: EdgeProps) {
  const setEdgeControl = useContext(ReactFlowEdgeControlRegistryContext)
  const setRouteHover = useContext(ReactFlowRouteHoverRegistryContext)
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const routeData =
    data && typeof data === "object" && (data as { kind?: string }).kind === "route"
      ? (data as {
          kind: "route"
          route?: string
          whenBadge?: string
          untilBadge?: string
          label?: string
          loopBack?: boolean
        })
      : undefined

  useEffect(() => {
    if (!selected || !setEdgeControl || !target) return
    setEdgeControl({
      edgeId: id,
      labelX,
      labelY,
      target,
      targetHandle: "route",
    })
    return () => {
      setEdgeControl((current) => (current?.edgeId === id ? null : current))
    }
  }, [selected, setEdgeControl, id, labelX, labelY, target])

  useEffect(() => {
    if (!setRouteHover || !routeData) return
    return () => {
      setRouteHover((current) => (current?.edgeId === id ? null : current))
    }
  }, [setRouteHover, id, routeData])

  return (
    <g
      onMouseEnter={() => {
        if (!setRouteHover || !routeData) return
        setRouteHover({
          edgeId: id,
          labelX,
          labelY,
          whenBadge: routeData.whenBadge,
          untilBadge: routeData.untilBadge,
          label: routeData.label,
          route: routeData.route,
          loopBack: routeData.loopBack,
        })
      }}
      onMouseLeave={() => {
        setRouteHover?.((current) => (current?.edgeId === id ? null : current))
      }}
    >
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={interactionWidth}
      />
    </g>
  )
}
