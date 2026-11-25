import { GitBranch } from "lucide-react"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { type ReactFlowDataEdgeData, type ReactFlowEdge } from "../../graph/index.js"

/**
 * Props for {@link EdgePanel}.
 * @category App
 */
export interface EdgePanelProps {
  manifest?: ExecutionManifest
  edge?: ReactFlowEdge
}

/**
 * Inspector for a selected data branch: source port, target port, and delete hint.
 * @category App
 */
export function EdgePanel({ edge }: EdgePanelProps) {
  if (!edge || edge.data.kind !== "data") {
    return (
      <section data-testid="edge-panel" className="space-y-2 text-[12px] text-on-surface-variant">
        <p>Select a branch to inspect its ports. Delete removes the $ref.</p>
      </section>
    )
  }

  const data = edge.data as ReactFlowDataEdgeData

  return (
    <section data-testid="edge-panel" data-edge-id={edge.id} className="space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-on-surface">
          <GitBranch className="h-4 w-4 text-primary" aria-hidden="true" />
          Branch
        </h3>
      </header>
      <div className="space-y-2 text-[12px]">
        <p className="font-mono text-label uppercase text-on-surface-variant">Source port</p>
        <p className="font-mono text-[11px] text-on-surface" data-testid="edge-source-port">
          {edge.source} / {edge.sourceHandle ?? "(default)"}
        </p>
        <p className="font-mono text-label uppercase text-on-surface-variant">Target port</p>
        <p className="font-mono text-[11px] text-on-surface" data-testid="edge-target-port">
          {edge.target} / {edge.targetHandle ?? data.inputPath}
        </p>
      </div>
    </section>
  )
}