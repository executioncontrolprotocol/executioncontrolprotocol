import type { StepNode, WorkflowManifest, WorkflowNode } from "@executioncontrolprotocol/types"

/** Index of step ids to lodash paths within a workflow manifest. @category Patch */
export interface StepIndex {
  /** Step id → lodash path (e.g. `steps[1]` or `steps[2].steps[0]`). */
  pathsById: Map<string, string>
  /** Ids that appear more than once in the graph. */
  duplicates: string[]
}

function walkNodes(
  nodes: WorkflowNode[],
  parentPath: string,
  pathsById: Map<string, string>,
  idCounts: Map<string, number>
): void {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]!
    const nodePath = `${parentPath}[${index}]`

    if (!node.type || node.type === "step") {
      const step = node as StepNode
      const count = (idCounts.get(step.id) ?? 0) + 1
      idCounts.set(step.id, count)
      if (count === 1) {
        pathsById.set(step.id, nodePath)
      }
      continue
    }

    if (node.type === "parallel") {
      for (let bi = 0; bi < node.branches.length; bi++) {
        walkNodes(node.branches[bi]!, `${nodePath}.branches[${bi}]`, pathsById, idCounts)
      }
      continue
    }

    if (node.type === "branch") {
      for (let bi = 0; bi < node.branches.length; bi++) {
        walkNodes(
          node.branches[bi]!.steps,
          `${nodePath}.branches[${bi}].steps`,
          pathsById,
          idCounts
        )
      }
      continue
    }

    if (node.type === "loop") {
      walkNodes(node.steps, `${nodePath}.steps`, pathsById, idCounts)
    }
  }
}

/**
 * Build a step id index for patch path resolution.
 * @category Patch
 */
export function buildStepIndex(manifest: WorkflowManifest): StepIndex {
  const pathsById = new Map<string, string>()
  const idCounts = new Map<string, number>()
  walkNodes(manifest.steps, "steps", pathsById, idCounts)
  const duplicates = [...idCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
  return { pathsById, duplicates }
}
