import { applyPatch, renderWorkflowToFluent } from "@executioncontrolprotocol/core"
import type { EcpPatchInput, InputValue, WorkflowManifest } from "@executioncontrolprotocol/core/types"

/**
 * Apply a patch to a workflow manifest and render Fluent source for saving back to disk.
 * Graph edits go through core `applyPatch`, then `renderWorkflowToFluent`.
 * @category App
 */
export function renderPatchedManifest(
  manifest: WorkflowManifest,
  input: EcpPatchInput
): string {
  const patched = applyPatch(manifest, input)
  if (!patched.success || !patched.result) {
    const message =
      patched.diagnostics.map((item) => item.message).join("; ") || "Patch failed"
    throw new Error(message)
  }
  return renderWorkflowToFluent(patched.result)
}

/**
 * Apply a step-input patch and render Fluent source for saving back to disk.
 * @category App
 */
export function renderPatchedStepInput(
  manifest: WorkflowManifest,
  stepId: string,
  input: Record<string, InputValue>
): string {
  return renderPatchedManifest(manifest, {
    [`steps[${stepId}].input`]: input,
  })
}
