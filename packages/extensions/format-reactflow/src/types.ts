/** Port on a React Flow step node. @category Encoding */
export interface ReactFlowPort {
  /** Handle id (matches edge sourceHandle / targetHandle). */
  id: string
  /** Parameter / field name. */
  name: string
  /** Human-readable type (EQL-ish or `unknown`). */
  typeLabel: string
  /** Whether the field is required (inputs only). */
  required?: boolean
}

/** Step node payload. @category Encoding */
export interface ReactFlowStepData {
  /** Display label. */
  label: string
  /** Capability id (`uses`). */
  uses?: string
  /** Commit key (`as`). */
  as?: string
  /** Input handles. */
  inputs: ReactFlowPort[]
  /** Output handles. */
  outputs: ReactFlowPort[]
}

/** Group node payload (parallel / branch / loop). @category Encoding */
export interface ReactFlowGroupData {
  /** Display label. */
  label: string
  /** Structural kind. */
  kind: "parallel" | "branch" | "loop" | "workflow"
}

/** React Flow node. @category Encoding */
export interface ReactFlowNode {
  /** Node id (step id or group id). */
  id: string
  /** Node type for the viewer. */
  type: "ecp-step" | "ecp-group"
  /** Layout position. */
  position: { x: number; y: number }
  /** Node payload. */
  data: ReactFlowStepData | ReactFlowGroupData
  /** Parent group id when nested. */
  parentId?: string
  /** Soft size hint for layout / group bounds. */
  style?: { width?: number; height?: number }
}

/** Edge kind. @category Encoding */
export type ReactFlowEdgeKind = "data" | "control"

/** React Flow edge. @category Encoding */
export interface ReactFlowEdge {
  /** Edge id. */
  id: string
  /** Source node id. */
  source: string
  /** Target node id. */
  target: string
  /** Source handle id. */
  sourceHandle?: string
  /** Target handle id. */
  targetHandle?: string
  /** Edge metadata. */
  data: { kind: ReactFlowEdgeKind }
}

/** Encoded React Flow document. @category Encoding */
export interface ReactFlowDocument {
  /** Nodes. */
  nodes: ReactFlowNode[]
  /** Edges. */
  edges: ReactFlowEdge[]
}

/** Encode options. @category Encoding */
export interface ReactFlowEncodeOptions {
  /** Rank direction for dagre. Default `LR`. */
  direction?: "LR" | "TB"
  /** Node width used for layout. */
  nodeWidth?: number
  /** Node height used for layout. */
  nodeHeight?: number
}

/** Step run status for progress events. @category Encoding */
export type ReactFlowStepStatus = "idle" | "pending" | "running" | "completed" | "failed"

/** Detail for `step:status` progress events. @category Encoding */
export interface ReactFlowStepStatusDetail {
  /** Workflow step id. */
  stepId: string
  /** Status. */
  status: ReactFlowStepStatus
}

/** Detail for `run:reset` / `run:done`. @category Encoding */
export interface ReactFlowRunLifecycleDetail {
  /** Run id when available. */
  runId?: string
  /** Terminal outcome when done. */
  outcome?: "completed" | "failed" | "cancelled"
}
