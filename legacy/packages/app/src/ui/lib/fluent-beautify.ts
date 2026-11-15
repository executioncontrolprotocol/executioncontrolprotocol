import { renderWorkflowToFluent } from "@executioncontrolprotocol/core"
import type { WorkflowManifest } from "@executioncontrolprotocol/core/types"

/** Same guard as compile-on-edit: skip placeholder / empty editor source. @category App */
export function shouldBeautifyFluentSource(source: string | undefined): source is string {
  if (source === undefined) return false
  const trimmed = source.trim()
  if (!trimmed || trimmed.startsWith("// Fluent API will appear here")) return false
  return true
}

/** Render canonical pretty-printed Fluent for a workflow manifest. @category App */
export function formatFluentManifest(manifest: WorkflowManifest): string {
  return renderWorkflowToFluent(manifest)
}
