import type { StepNode, WorkflowManifest, WorkflowNode } from "@executioncontrolprotocol/types"
import { slugify } from "../util/slug.js"

function ensureUniqueId(base: string, used: Set<string>): string {
  let id = base
  let suffix = 2
  while (used.has(id)) {
    id = `${base}-${suffix}`
    suffix++
  }
  used.add(id)
  return id
}

function assignIdsToNodes(nodes: WorkflowNode[], used: Set<string>): WorkflowNode[] {
  return nodes.map((node) => {
    if (!node.type || node.type === "step") {
      const step = { ...node } as StepNode
      const base = step.id || slugify(step.label ?? String(step.uses))
      step.id = ensureUniqueId(base, used)
      return step
    }

    if (node.type === "parallel") {
      return {
        ...node,
        branches: node.branches.map((branch) => assignIdsToNodes(branch, used)),
      }
    }

    if (node.type === "branch") {
      return {
        ...node,
        branches: node.branches.map((b) => ({
          ...b,
          steps: assignIdsToNodes(b.steps, used),
        })),
      }
    }

    if (node.type === "loop") {
      return {
        ...node,
        steps: assignIdsToNodes(node.steps, used),
      }
    }

    return node
  })
}

/** Deep-clone a workflow manifest (JSON-safe portable document). */
function cloneManifest(manifest: WorkflowManifest): WorkflowManifest {
  return JSON.parse(JSON.stringify(manifest)) as WorkflowManifest
}

/**
 * Ensure every step in the workflow graph has a globally unique id.
 * @category Workflow
 */
export function assignUniqueStepIds(manifest: WorkflowManifest): WorkflowManifest {
  const next = cloneManifest(manifest)
  const used = new Set<string>()
  next.steps = assignIdsToNodes(next.steps, used)
  return next
}
