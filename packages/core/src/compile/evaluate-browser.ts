import type { WorkflowManifest } from "@executioncontrolprotocol/types"
import { extractWorkflowFromModule } from "./extract-workflow-module.js"

export { extractWorkflowFromModule } from "./extract-workflow-module.js"

/** Evaluate ESM workflow module code in the browser (blob URL + dynamic import). */
export async function evaluateWorkflowModule(
  code: string,
  _filename = "workflow.js"
): Promise<WorkflowManifest> {
  const blob = new Blob([code], { type: "text/javascript" })
  const url = URL.createObjectURL(blob)
  try {
    const mod = (await import(/* @vite-ignore */ url)) as Record<string, unknown>
    return extractWorkflowFromModule(mod)
  } finally {
    URL.revokeObjectURL(url)
  }
}
