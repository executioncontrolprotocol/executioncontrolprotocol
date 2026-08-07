import type { WorkflowManifest } from "@executioncontrolprotocol/types"
import { renderNodes } from "./render-node.js"
import { createImportNeeds } from "./render-value.js"

/** Options for rendering a manifest to Fluent source. @category Fluent */
export interface RenderWorkflowToFluentOptions {
  /** Prefer compact output (reserved for future formatting). */
  compact?: boolean
  /** Import module target (`@executioncontrolprotocol/core` default, `@executioncontrolprotocol/browser` for browser demo). */
  importFrom?: "@executioncontrolprotocol/core" | "@executioncontrolprotocol/browser"
}

function renderImports(
  needs: ReturnType<typeof createImportNeeds>,
  importFrom: "@executioncontrolprotocol/core" | "@executioncontrolprotocol/browser"
): string {
  const names: string[] = ["workflow", "step"]
  if (needs.ref) names.push("ref")
  if (needs.state) names.push("state")
  if (needs.secrets) names.push("secrets")
  if (needs.browser) names.push("browser")
  if (needs.expr) names.push("expr")
  if (needs.loop) names.push("loop")
  if (needs.parallel) names.push("parallel")
  if (needs.branch) names.push("branch")
  return `import {\n  ${names.join(",\n  ")},\n} from "${importFrom}";\n\n`
}

/**
 * Render workflow manifest to Fluent API TypeScript source.
 * @category Fluent
 */
export function renderWorkflowToFluent(
  manifest: WorkflowManifest,
  _options?: RenderWorkflowToFluentOptions
): string {
  const importFrom = _options?.importFrom ?? "@executioncontrolprotocol/core"
  const needs = createImportNeeds()
  const nodes = renderNodes(manifest.steps, needs, "    ")
  const header = renderImports(needs, importFrom)
  let body = `export default workflow(${JSON.stringify(manifest.workflow.label ?? manifest.workflow.id)})\n`
  if (manifest.workflow.id) {
    body += `  .id(${JSON.stringify(manifest.workflow.id)})\n`
  }
  body += `  .run([\n${nodes},\n  ]);\n`
  return header + body
}

/** @deprecated Use {@link renderWorkflowToFluent}. @category Fluent */
export const renderWorkflowManifestToFluent = renderWorkflowToFluent
