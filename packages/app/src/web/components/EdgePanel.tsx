import { GitBranch, Trash2 } from "lucide-react"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import {
  connectorDeletePreview,
  deleteConnector,
  type ReactFlowDataEdgeData,
  type ReactFlowEdge,
  type StructureEditResult,
} from "../../graph/index.js"

/**
 * Props for {@link EdgePanel}.
 * @category App
 */
export interface EdgePanelProps {
  /** Open execution manifest. */
  manifest?: ExecutionManifest
  /** Selected branch. */
  edge?: ReactFlowEdge
  /** True while a run is busy or a replay is selected. */
  readOnly?: boolean
  /** Persist a manifest edit (one saved edit, one undo step). */
  applyManifestEdit?: (edit: (manifest: ExecutionManifest) => StructureEditResult) => Promise<boolean>
  /** Called after the branch was deleted. */
  onDeleted?: () => void
}

/**
 * Inspector for a selected branch: its source and target ports and a Delete button that removes the `$ref`.
 * @category App
 */
export function EdgePanel({ manifest, edge, readOnly = false, applyManifestEdit, onDeleted }: EdgePanelProps) {
  if (!edge || edge.data.kind !== "data") {
    return (
      <section data-testid="edge-panel" className="space-y-2 text-[12px] text-on-surface-variant">
        <p>Select a branch to inspect its ports. Delete removes the $ref.</p>
      </section>
    )
  }

  const data = edge.data as ReactFlowDataEdgeData
  const preview = manifest ? connectorDeletePreview(manifest, edge) : undefined
  const canDelete = !readOnly && applyManifestEdit !== undefined && preview?.ok === true
  const reason = readOnly ? "The execution is read-only while a run is shown" : preview && !preview.ok ? preview.reason : undefined

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
      <button
        type="button"
        data-testid="edge-delete"
        disabled={!canDelete}
        title={canDelete ? undefined : reason}
        className="inline-flex items-center gap-1.5 rounded border border-outline-variant px-3 py-1.5 text-[12px] text-on-surface enabled:hover:bg-surface-container-highest disabled:opacity-50"
        onClick={() => {
          if (!applyManifestEdit) return
          void applyManifestEdit((current) => deleteConnector(current, edge)).then((ok) => {
            if (ok) onDeleted?.()
          })
        }}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        Delete
      </button>
    </section>
  )
}
