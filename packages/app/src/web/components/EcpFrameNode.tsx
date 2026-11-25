import type { NodeProps } from "@xyflow/react"
import type { ReactFlowFrameData } from "../../graph/index.js"

/**
 * Decorative container outline (dotted border and optional band dividers; not interactive).
 * @category App
 */
export function EcpFrameNode({ data }: NodeProps) {
  const frame = data as unknown as ReactFlowFrameData

  return (
    <div
      className="ecp-rf-frame"
      data-testid={`ecp-frame-${frame.structureId}`}
      data-kind={frame.structureKind}
      data-band-count={frame.bands.length}
      data-detached={frame.detached ? "true" : "false"}
      style={{ width: "100%", height: "100%" }}
    >
      {frame.bandDividerYs?.map((offsetY, index) => (
        <div
          key={`${frame.structureId}-divider-${index}`}
          className="ecp-rf-frame-band-divider"
          data-testid={`ecp-frame-divider-${frame.structureId}-${index}`}
          style={{ top: offsetY }}
        />
      ))}
      {frame.detached ? (
        <span className="ecp-rf-detached-badge" data-testid={`ecp-detached-${frame.structureId}`}>
          disconnected
        </span>
      ) : null}
    </div>
  )
}