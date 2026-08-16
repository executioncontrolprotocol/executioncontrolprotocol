import { globalRegistry, type Registry } from "@executioncontrolprotocol/core"
import { formatReactflowExtension } from "./extension.js"

export { formatReactflowExtension } from "./extension.js"
export { workflowToReactFlow } from "./workflow-to-reactflow.js"
export { extractDataEdges, parseStateRef } from "./extract-data-edges.js"
export { portsForStep, formatLiteralValue, truncateLiteralPreview, ensureOutputPort } from "./ports-from-zod.js"
export { layoutReactFlowDocument } from "./layout.js"
export {
  reactFlowRunProgress,
  ReactFlowRunProgress,
  type ReactFlowProgressEventName,
} from "./progress.js"
export type {
  ReactFlowDocument,
  ReactFlowEdge,
  ReactFlowEdgeKind,
  ReactFlowEncodeOptions,
  ReactFlowGroupData,
  ReactFlowNode,
  ReactFlowPort,
  ReactFlowPortBinding,
  ReactFlowRunLifecycleDetail,
  ReactFlowStepData,
  ReactFlowStepStatus,
  ReactFlowStepStatusDetail,
} from "./types.js"

/** Register React Flow format extension. @category Extensions */
export async function registerFormatReactflowExtension(
  registry: Registry = globalRegistry
): Promise<void> {
  if (!registry.getExtension("@executioncontrolprotocol/format-reactflow")) {
    await registry.registerExtension(formatReactflowExtension)
  }
}
