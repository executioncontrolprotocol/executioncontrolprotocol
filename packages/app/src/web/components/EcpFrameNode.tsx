import type { NodeProps } from "@xyflow/react"
import type { ReactFlowFrameData } from "../../graph/index.js"

/**
 * View-only decorative frame around a parallel line (not a dagre parent).
 * @category App
 */
export function EcpFrameNode({ data }: NodeProps) {
  const frame = data as unknown as ReactFlowFrameData
  return (
    <div
      className="ecp-rf-frame"
      data-testid={`ecp-frame-${frame.structureId}-${frame.armIndex}`}
      style={{ width: "100%", height: "100%" }}
    >
      {frame.label ? (
        <div className="ecp-rf-frame-label" data-testid={`ecp-frame-label-${frame.structureId}-${frame.armIndex}`}>
          {frame.label}
        </div>
      ) : null}
    </div>
  )
}