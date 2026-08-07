import { globalRegistry, type Registry } from "@executioncontrolprotocol/core"
import { formatMermaidExtension } from "./extension.js"

export { formatMermaidExtension } from "./extension.js"
export { workflowToMermaid, workflowToMermaid as renderWorkflowToMermaid } from "./workflow-to-mermaid.js"
export type { MermaidEncodeOptions, MermaidFlowchartDirection } from "./options.js"
export { mermaidFlowchartHeader } from "./options.js"

/** Register Mermaid format extension. @category Extensions */
export async function registerFormatMermaidExtension(
  registry: Registry = globalRegistry
): Promise<void> {
  if (!registry.getExtension("@executioncontrolprotocol/format-mermaid")) {
    await registry.registerExtension(formatMermaidExtension)
  }
}
