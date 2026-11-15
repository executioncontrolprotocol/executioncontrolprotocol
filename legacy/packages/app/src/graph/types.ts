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
  /** Short `.when()` expression badge when the step is gated. */
  whenBadge?: string
  /** Input handles. */
  inputs: ReactFlowPort[]
  /** Output handles. */
  outputs: ReactFlowPort[]
}

/** Runtime highlight for branch / loop arm step sets. @category App */
export type ReactFlowArmRunState = "idle" | "taken" | "skipped"

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
  type: "ecp-step" | "ecp-io"
  /** Layout position (absolute; canvas is the workflow surface). */
  position: { x: number; y: number }
  /** Node payload. */
  data: ReactFlowStepData | ReactFlowIoData
  /** Soft size hint for layout. */
  style?: { width?: number; height?: number }
}

/** Edge kind. @category App */
export type ReactFlowEdgeKind = "data" | "control" | "route"

/** Structural route subtype for published non-data edges. @category App */
export type ReactFlowRouteKind = "branch" | "parallel" | "loop"

/**
 * Metadata on a published route edge (branch / parallel / loop structure).
 * @category App
 */
export interface ReactFlowRouteEdgeData {
  /** Discriminator. */
  kind: "route"
  /** Structural subtype. */
  route: ReactFlowRouteKind
  /** Branch / parallel / loop node id in the workflow manifest. */
  structureId: string
  /** Branch arm index when `route` is `branch`. */
  armIndex?: number
  /** Arm / lane label when present. */
  label?: string
  /** Short `when` badge for a branch arm. */
  whenBadge?: string
  /** Short `until` badge for a loop. */
  untilBadge?: string
  /** Loop `maxRounds` when set. */
  maxRounds?: number
  /** True for the visual loop-back edge (excluded from dagre ranks). */
  loopBack?: boolean
  /** Leaf step ids under this arm / loop body (for skipped styling). */
  stepIds?: string[]
}

/** Data or layout-control edge payload. @category App */
export interface ReactFlowPlainEdgeData {
  /** Discriminator. */
  kind: "data" | "control"
}

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
  data: ReactFlowPlainEdgeData | ReactFlowRouteEdgeData
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
export type ReactFlowStepStatus =
  | "idle"
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"

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
