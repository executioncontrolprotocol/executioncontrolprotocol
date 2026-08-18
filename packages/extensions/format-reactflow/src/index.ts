import { globalRegistry, type Registry } from "@executioncontrolprotocol/core"
import { formatReactflowExtension } from "./extension.js"

export { formatReactflowExtension } from "./extension.js"
export { workflowToReactFlow } from "./workflow-to-reactflow.js"
export { extractDataEdges, parseStateRef } from "./extract-data-edges.js"
export {
  acceptsReactFlowNode,
  returnsReactFlowNode,
  portsFromJsonSchemaObject,
  jsonSchemaObjectProperties,
  WORKFLOW_ACCEPTS_NODE_ID,
  WORKFLOW_RETURNS_NODE_ID,
} from "./io-from-schema.js"
export { portsForStep, formatLiteralValue, truncateLiteralPreview, ensureOutputPort } from "./ports-from-zod.js"
export {
  valueSchemaFromZod,
  valueSchemaFromEqlLabel,
  valueSchemaFromJsonSchemaProp,
  valueSchemasFromCapabilitySchema,
  unwrapZodType,
  type ValueSchemaHint,
} from "./value-schema-hint.js"
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
  ReactFlowIoData,
  ReactFlowIoKind,
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
