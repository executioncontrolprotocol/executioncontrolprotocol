/** How a step input is supplied on the graph. @category App */
export type ReactFlowPortBinding = "literal" | "ref"

/** Port on a React Flow step node. @category App */
export interface ReactFlowPort {
  /** Handle id (matches edge sourceHandle / targetHandle). */
  id: string
  /** Parameter / field name. */
  name: string
  /** Human-readable type (`string`, `file!`, or `unknown`). */
  typeLabel: string
  /**
   * Portable JSON Schema hint for the port value (primitives + constraints).
   * Never includes UI widget names — viewers map this to controls.
   */
  valueSchema?: Record<string, unknown>
  /** Whether the field is required (inputs only). */
  required?: boolean
  /** How this input is supplied (`literal` `.with()` value or `$ref`). */
  binding?: ReactFlowPortBinding
  /** Truncated display for literal values. */
  valuePreview?: string
  /** Full literal string for tooltip / editor seed. */
  valueTitle?: string
  /** Short `$ref` path without `state.` (e.g. `summary.text`). */
  refPath?: string
}

/** Step node payload. @category App */
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

/**
 * Group node payload (optional viewer type; encoder emits step nodes only).
 * @category App
 */
export interface ReactFlowGroupData {
  /** Display label. */
  label: string
  /** Structural kind. */
  kind: "parallel" | "branch" | "loop" | "workflow"
}

/** Workflow I/O projection (`accepts` / `returns`) — not a capability step. @category App */
export type ReactFlowIoKind = "accepts" | "returns"

/** Payload for projected Inputs / Outputs nodes. @category App */
export interface ReactFlowIoData {
  /** Display label (`Inputs` / `Outputs`). */
  label: string
  /** Which workflow contract this node edits. */
  kind: ReactFlowIoKind
  /** Input handles (Outputs node only). */
  inputs: ReactFlowPort[]
  /** Output handles (Inputs node only). */
  outputs: ReactFlowPort[]
}

/** React Flow node. @category App */
export interface ReactFlowNode {
  /** Node id (typically a workflow step id). */
  id: string
  /** Node type for the viewer. */
  type: "ecp-step" | "ecp-group" | "ecp-io"
  /** Layout position (absolute; canvas is the workflow surface). */
  position: { x: number; y: number }
  /** Node payload. */
  data: ReactFlowStepData | ReactFlowGroupData | ReactFlowIoData
  /** Soft size hint for layout. */
  style?: { width?: number; height?: number }
}

/** Edge kind. @category App */
export type ReactFlowEdgeKind = "data" | "control"

/** React Flow edge. @category App */
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

/** Encoded React Flow document. @category App */
export interface ReactFlowDocument {
  /** Nodes. */
  nodes: ReactFlowNode[]
  /** Edges. */
  edges: ReactFlowEdge[]
}

/** JSON Schema I/O for one capability, from authoring `describe()`. @category App */
export interface CapabilityIoSchemas {
  /** Projected capability input JSON Schema. */
  inputSchema?: unknown
  /** Projected capability output JSON Schema. */
  outputSchema?: unknown
}

/**
 * Capability id → JSON Schema I/O used when the encoder has no {@link Registry}.
 * @category App
 */
export type CapabilitySchemaIndex = Record<string, CapabilityIoSchemas>

/** Encode options. @category App */
export interface ReactFlowEncodeOptions {
  /** Rank direction for dagre. Default `LR`. */
  direction?: "LR" | "TB"
  /** Node width used for layout. */
  nodeWidth?: number
  /** Node height used for layout. */
  nodeHeight?: number
  /**
   * Capability I/O JSON Schemas from `describe()`. Used when `registry` is
   * omitted so the live App can still draw typed ports.
   */
  capabilitySchemas?: CapabilitySchemaIndex
}

/** Step run status for progress events. @category App */
export type ReactFlowStepStatus = "idle" | "pending" | "running" | "completed" | "failed"

/** Detail for `step:status` progress events. @category App */
export interface ReactFlowStepStatusDetail {
  /** Workflow step id. */
  stepId: string
  /** Status. */
  status: ReactFlowStepStatus
  /** Optional failure message for hover tooltips. */
  message?: string
}

/** Detail for `run:reset` / `run:done`. @category App */
export interface ReactFlowRunLifecycleDetail {
  /** Run id when available. */
  runId?: string
  /** Terminal outcome when done. */
  outcome?: "completed" | "failed" | "cancelled"
}
