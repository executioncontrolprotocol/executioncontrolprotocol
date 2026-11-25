import type { ExecutionManifest, IfNode, ParallelNode } from "@executioncontrolprotocol/protocol"
import { findStructure } from "../../graph/index.js"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-[12px]">
      <span className="w-20 shrink-0 font-mono text-label uppercase text-on-surface-variant">{label}</span>
      <span className="text-on-surface">{children}</span>
    </div>
  )
}

/**
 * Read-only `if` / `parallel` structure details for the graph sidebar.
 * @category App
 */
export function StructurePanel({
  manifest,
  structureId,
}: {
  manifest?: ExecutionManifest
  structureId: string
}) {
  const node = manifest ? findStructure(manifest, structureId) : undefined
  if (!manifest || !node) {
    return (
      <section data-testid="structure-panel" className="text-[12px] text-on-surface-variant">
        Structure not found.
      </section>
    )
  }
  if (node.type === "if") {
    const ifNode = node as IfNode
    return (
      <section data-testid="structure-panel" className="space-y-2">
        <Row label="Kind">if</Row>
        <Row label="Id">{ifNode.id}</Row>
        {ifNode.label ? <Row label="Label">{ifNode.label}</Row> : null}
        <Row label="Then">{String(ifNode.then.length)} nodes</Row>
        <Row label="Else">{String(ifNode.else?.length ?? 0)} nodes</Row>
      </section>
    )
  }
  const parallel = node as ParallelNode
  return (
    <section data-testid="structure-panel" className="space-y-2">
      <Row label="Kind">parallel</Row>
      <Row label="Id">{parallel.id}</Row>
      <Row label="Paths">{String(parallel.paths.length)}</Row>
    </section>
  )
}