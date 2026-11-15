import { useStore, useReactFlow } from "@xyflow/react"
import type { RefObject } from "react"
import type { RouteHoverState } from "./reactflow-route-hover-registry.js"

const ROUTE_PILL_Z_INDEX = 1015

interface RouteHoverPillOverlayProps {
  canvasRef: RefObject<HTMLDivElement | null>
  hover: RouteHoverState | null
}

function pillText(hover: RouteHoverState): string {
  if (hover.whenBadge) {
    return hover.label ? `${hover.label}: ${hover.whenBadge}` : hover.whenBadge
  }
  if (hover.untilBadge) {
    const prefix = hover.loopBack ? "loop until " : "until "
    return `${prefix}${hover.untilBadge}`
  }
  if (hover.label) return hover.label
  return hover.route ?? "route"
}

/**
 * Floating midpoint pill for route edges (hover).
 * Position tracks pan/zoom via {@link useReactFlow.flowToScreenPosition}.
 */
export function RouteHoverPillOverlay({ canvasRef, hover }: RouteHoverPillOverlayProps) {
  useStore((state) => state.transform)
  const { flowToScreenPosition } = useReactFlow()

  if (!hover) return null
  const canvas = canvasRef.current
  if (!canvas) return null

  const rect = canvas.getBoundingClientRect()
  const screen = flowToScreenPosition({ x: hover.labelX, y: hover.labelY })
  const left = screen.x - rect.left
  const top = screen.y - rect.top - 18

  return (
    <div
      className="pointer-events-none absolute rounded border border-outline-variant bg-surface-container-high px-2 py-0.5 font-mono text-[10px] text-on-surface shadow-sm"
      style={{
        left,
        top,
        transform: "translate(-50%, -100%)",
        zIndex: ROUTE_PILL_Z_INDEX,
      }}
      data-testid="ecp-route-hover-pill"
    >
      {pillText(hover)}
    </div>
  )
}
