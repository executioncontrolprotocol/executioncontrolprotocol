import type { ReactNode } from "react"
import type { BranchNode, ExecutionManifest, Node, ParallelNode } from "@executioncontrolprotocol/protocol"
import { GitBranch, Columns2 } from "lucide-react"
import { formatExprBadge } from "../../graph/index.js"

function findBranch(manifest: ExecutionManifest | undefined, id: string): BranchNode | undefined {
  if (!manifest) return undefined
  const walk = (nodes: Node[]): BranchNode | undefined => {
    for (const node of nodes) {
      if (node.type === "branch" && node.id === id) return node
      if (node.type === "parallel") {
        for (const line of node.branches) {
          const hit = walk(line)
          if (hit) return hit
        }
      } else if (node.type === "branch") {
        for (const arm of node.branches) {
          const hit = walk(arm.steps)
          if (hit) return hit
        }
      } else if (node.type === "loop") {
        const hit = walk(node.steps)
        if (hit) return hit
      }
    }
    return undefined
  }
  return walk(manifest.steps)
}

function findParallel(manifest: ExecutionManifest | undefined, id: string): ParallelNode | undefined {
  if (!manifest) return undefined
  const walk = (nodes: Node[]): ParallelNode | undefined => {
    for (const node of nodes) {
      if (node.type === "parallel" && node.id === id) return node
      if (node.type === "parallel") {
        for (const line of node.branches) {
          const hit = walk(line)
          if (hit) return hit
        }
      } else if (node.type === "branch") {
        for (const arm of node.branches) {
          const hit = walk(arm.steps)
          if (hit) return hit
        }
      } else if (node.type === "loop") {
        const hit = walk(node.steps)
        if (hit) return hit
      }
    }
    return undefined
  }
  return walk(manifest.steps)
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-[12px]">
      <span className="font-mono text-label uppercase text-on-surface-variant">{label}</span>
      <span className="text-on-surface">{children}</span>
    </div>
  )
}

/**
 * Read-only branch / parallel structure details for the graph sidebar.
 * @category App
 */
export function StructurePanel({
  manifest,
  structureId,
}: {
  manifest?: ExecutionManifest
  structureId: string
}) {
  const branch = findBranch(manifest, structureId)
  const parallel = findParallel(manifest, structureId)

  if (!manifest || (!branch && !parallel)) {
    return (
      <section data-testid="structure-panel" className="text-[12px] text-on-surface-variant">
        Structure {structureId} was not found in the manifest.
      </section>
    )
  }

  if (branch) {
    return (
      <section data-testid="structure-panel" data-structure-id={structureId} className="space-y-4">
        <header className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="font-display text-lg font-semibold text-on-surface">{branch.label ?? "branch"}</h3>
        </header>
        <Row label="Kind">branch</Row>
        <Row label="Id">{branch.id}</Row>
        {branch.label ? <Row label="Label">{branch.label}</Row> : null}
        <div className="space-y-3">
          <p className="font-mono text-label uppercase text-on-surface-variant">Arms</p>
          <ul className="space-y-2">
            {branch.branches.map((arm, index) => (
              <li key={index} className="rounded border border-outline-variant/60 p-2 text-[12px]">
                <Row label="Label">{arm.label ?? `arm ${index + 1}`}</Row>
                <Row label="Condition">
                  {arm.expr !== undefined ? formatExprBadge(arm.expr) : "default"}
                </Row>
              </li>
            ))}
          </ul>
        </div>
      </section>
    )
  }

  const p = parallel!
  return (
    <section data-testid="structure-panel" data-structure-id={structureId} className="space-y-4">
      <header className="flex items-center gap-2">
        <Columns2 className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 className="font-display text-lg font-semibold text-on-surface">{p.label ?? "parallel"}</h3>
      </header>
      <Row label="Kind">parallel</Row>
      <Row label="Id">{p.id}</Row>
      {p.label ? <Row label="Label">{p.label}</Row> : null}
      <Row label="Lines">{String(p.branches.length)}</Row>
    </section>
  )
}