import type { WorkflowManifest } from "@executioncontrolprotocol/types"
import type { WorkflowBuilder } from "../workflow/builder.js"

const WORKFLOW_EXPORT_NAMES = ["default", "workflow", "defaultWorkflow", "manifest"]

/** Extract workflow builder or manifest from evaluated module exports. */
export function extractWorkflowFromModule(
  mod: Record<string, unknown>
): WorkflowManifest {
  for (const name of WORKFLOW_EXPORT_NAMES) {
    const exp = mod[name]
    if (!exp) continue
    const value = typeof exp === "function" ? (exp as () => unknown)() : exp
    if (value && typeof value === "object") {
      if ("toManifest" in value && typeof (value as WorkflowBuilder).toManifest === "function") {
        return (value as WorkflowBuilder).toManifest()
      }
      if ("schema" in value && (value as WorkflowManifest).schema === "@executioncontrolprotocol.workflow") {
        return value as WorkflowManifest
      }
    }
  }
  throw new Error(
    "Module must export a workflow builder or @executioncontrolprotocol.workflow manifest (default, workflow, or defaultWorkflow)"
  )
}
