import { useMemo } from "react"
import { ViewportPortal } from "@xyflow/react"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import {
  computeRailVisualLayer,
  type RailVisualShape,
  type RunGraphState,
  EXECUTION_ACCEPTS_NODE_ID,
  EXECUTION_RETURNS_NODE_ID,
  type ReactFlowNode,
} from "../../graph/index.js"

/**
 * Pointer-events-none SVG overlay for rail tubes, joins and loop regions (flow coordinates).
 * @category App
 */
export function RailVisualLayer({
  manifest,
  nodes,
  run,
}: {
  manifest: ExecutionManifest
  nodes: readonly ReactFlowNode[]
  run: RunGraphState
}) {
  const shapes = useMemo(() => {
    const steps = Array.isArray(manifest.steps) ? manifest.steps : []
    const hasReturns = nodes.some((node) => node.id === EXECUTION_RETURNS_NODE_ID)
    return computeRailVisualLayer(
      steps,
      nodes,
      undefined,
      hasReturns
        ? { acceptsId: EXECUTION_ACCEPTS_NODE_ID, returnsId: EXECUTION_RETURNS_NODE_ID }
        : { acceptsId: EXECUTION_ACCEPTS_NODE_ID },
      { choices: run.choices },
    )
  }, [manifest, nodes, run.choices])

  return (
    <ViewportPortal>
      <svg className="ecp-rail-layer" data-testid="ecp-rail-layer" style={{ overflow: "visible" }}>
        <defs>
          <pattern
            id="ecp-loop-stripes"
            width="14"
            height="14"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(35)"
          >
            <rect width="14" height="14" fill="#a371f7" fillOpacity="0.07" />
            <rect width="5" height="14" fill="#a371f7" fillOpacity="0.07" />
          </pattern>
        </defs>
        {shapes.map((shape) => (
          <RailShape key={shapeKey(shape)} shape={shape} />
        ))}
      </svg>
    </ViewportPortal>
  )
}

function shapeKey(shape: RailVisualShape): string {
  if (shape.kind === "path") return `${shape.kind}:${shape.testId}`
  if (shape.kind === "loop") return `${shape.kind}:${shape.testId}`
  return `${shape.kind}:${shape.testId}`
}

function RailShape({ shape }: { shape: RailVisualShape }) {
  if (shape.kind === "path") {
    const opacity = shape.dimmed ? 0.35 : 1
    return (
      <path
        data-testid={shape.testId}
        data-kind={shape.dataKind}
        d={shape.d}
        fill={shape.fill ?? "none"}
        fillOpacity={shape.fill ? (shape.fillOpacity ?? 1) * opacity : undefined}
        stroke={shape.stroke}
        strokeOpacity={shape.strokeOpacity * opacity}
        strokeWidth={shape.strokeWidth}
        strokeLinecap="round"
        pointerEvents="none"
      />
    )
  }
  if (shape.kind === "loop") {
    const opacity = shape.dimmed ? 0.35 : 1
    return (
      <rect
        data-testid={shape.testId}
        data-kind="loop"
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rx={shape.rx}
        fill="url(#ecp-loop-stripes)"
        stroke={shape.stroke}
        strokeOpacity={shape.strokeOpacity * opacity}
        strokeWidth={shape.strokeWidth}
        strokeDasharray={shape.strokeDasharray}
        pointerEvents="none"
      />
    )
  }
  return (
    <text
      data-testid={shape.testId}
      x={shape.x}
      y={shape.y}
      fill={shape.fill}
      fontSize={12}
      fontWeight={shape.fontWeight}
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      pointerEvents="none"
    >
      {shape.text}
    </text>
  )
}