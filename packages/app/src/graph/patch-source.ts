import { applyPatch, renderWorkflowToFluent } from "@executioncontrolprotocol/core"
import type { InputValue, WorkflowManifest } from "@executioncontrolprotocol/core/types"

/**
 * Apply a step-input patch and render Fluent source for saving back to disk.
 * Graph edits go through core `applyPatch`, then `renderWorkflowToFluent`.
 * @category App
 */
export function renderPatchedStepInput(
  manifest: WorkflowManifest,
  stepId: string,
  input: Record<string, InputValue>
): string {
  const patched = applyPatch(manifest, {
    [`steps[${stepId}].input`]: input,
  })
  if (!patched.success || !patched.result) {
    const message =
      patched.diagnostics.map((item) => item.message).join("; ") || "Patch failed"
    throw new Error(message)
  }
  return renderWorkflowToFluent(patched.result)
}
