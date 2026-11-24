import type { CommitMode, JsonSchema } from "@executioncontrolprotocol/protocol"

/**
 * How a step input is supplied on the graph: a literal value, a `$ref` / `$state`
 * path, a `$expr` computed in QuickJS, or a `$script` value.
 * @category App
 */
export type ReactFlowPortBinding = "literal" | "ref" | "expr" | "script"

/**
 * Port on a React Flow step or I/O node.
 * @category App
 */
export interface ReactFlowPort {
  /** Handle id (matches edge `sourceHandle` / `targetHandle`). */
  id: string
  /** Parameter or field name. Dotted for nested paths. */
  name: string
  /** Human-readable type (`string`, `file!`, or `unknown`). A trailing `!` marks required. */
  typeLabel: string
  /**
   * Portable JSON Schema hint for the port value (primitives and constraints).
   * Never includes UI widget names; viewers map this to controls.
   */
  valueSchema?: Record<string, unknown>
  /** Whether the field is required (inputs only). */
  required?: boolean
  /** How this input is supplied. Absent when the input is not set. */
  binding?: ReactFlowPortBinding
  /** Truncated display for literal values. */
  valuePreview?: string
  /** Full literal string for tooltips and the node panel. */
  valueTitle?: string
  /** Short `$ref` / `$state` path without `state.` (for example `summary.text`). */
  refPath?: string
  /** True when the `$ref` is `optional`. */
  refOptional?: boolean
  /** `$expr` function source, when `binding` is `expr`. */
  exprSource?: string
  /** `$script.source`, when `binding` is `script` and the script is inline. */
  scriptSource?: string
  /** `$script.path`, when `binding` is `script` and the script is a file. */
  scriptPath?: string
}

/**
 * Step node payload.
 * @category App
 */
export interface ReactFlowStepData {
  /** True when the step is listed under manifest `detached`. */
  detached?: boolean
  /** Display label (`label`, else the node id). */
  label: string
  /** Capability id (`uses`). */
  uses: string
  /** Commit key (`as`). */
  as?: string
  /** Commit mode, when set. */
  mode?: CommitMode
  /** Config object id, when set. */
  config?: string
  /** Step `expr` gate source, when the step is gated. */
  exprBadge?: string
  /** Input handles. */
  inputs: ReactFlowPort[]
  /** Output handles. */
  outputs: ReactFlowPort[]
}

/**
 * Runtime highlight for branch arm and loop body step sets.
 * @category App
 */
export type ReactFlowArmRunState = "idle" | "taken" | "skipped"

/**
 * Execution I/O projection (`execution.accepts` / `execution.returns`); not a capability step.
 * @category App
 */
export type ReactFlowIoKind = "accepts" | "returns"

/**
 * Payload for the projected Inputs and Outputs nodes.
 * @category App
 */
export interface ReactFlowIoData {
  /** Display label (`Inputs` / `Outputs`). */
  label: string
  /** Which execution contract this node shows. */
  kind: ReactFlowIoKind
  /** Input handles (Outputs node only). */
  inputs: ReactFlowPort[]
  /** Output handles (Inputs node only). */
  outputs: ReactFlowPort[]
}

/**
 * Decorative frame around a branch, parallel, or loop (not a dagre parent; drawn after layout).
 * @category App
 */
export interface ReactFlowFrameData {
  /** True when the framed structure is under manifest `detached`. */
  detached?: boolean
  /** Branch, parallel, or loop id in the manifest. */
  structureId: string
  /** Which structure this frame outlines. */
  structureKind: "branch" | "parallel" | "loop"
  /** Set when `structureKind` is `loop`. */
  loopMode?: "while" | "for" | "forEach"
  /** Node `label`, or the fallback summary. */
  label?: string
}

/**
 * Target handle id for structural route edges (flow into a node).
 * @category App
 */
export const FLOW_IN_HANDLE = "flow-in"

/**
 * Source handle id for structural route edges (flow out of a node).
 * @category App
 */
export const FLOW_OUT_HANDLE = "flow-out"

/**
 * Target handle id for a `forEach` loop node's `ref` port.
 * @category App
 */
export const LOOP_REF_HANDLE = "ref"

/**
 * Target handle id for a `forEach` loop node's `collect` port.
 * @category App
 */
export const LOOP_COLLECT_HANDLE = "collect"

/**
 * Source handle id for a `forEach` loop node's `into` array output.
 * @category App
 */
export const LOOP_INTO_HANDLE = "into"

/**
 * Source handle id for a loop node's current item / iteration variable (`as`).
 * @category App
 */
export const LOOP_ITEM_HANDLE = "item"

/**
 * Payload for a loop head structure node on the graph (all loop modes).
 * @category App
 */
export interface ReactFlowLoopItemsData {
  /** True when the loop is listed under manifest `detached`. */
  detached?: boolean
  /** Display label (`label`, else the node id). */
  label: string
  /** Loop mode. */
  mode: "while" | "for" | "forEach"
  /** `ref` path (without `state.`), when the loop declares `ref`. */
  refPath?: string
  /** Item state key (`as`), for `for` / `forEach`. */
  as?: string
  /** `collect` path (without `state.`), for `forEach`. */
  collectPath?: string
  /** `into` state key, for `forEach`. */
  into?: string
  /** Loop `expr` badge when the loop is expr-driven. */
  exprBadge?: string
  /** `maxRounds` for `while` loops. */
  maxRounds?: number
  /** Configured concurrency (default 1), for `forEach`. */
  concurrency?: number
  /** Item error policy, for `forEach`. */
  onError?: "fail" | "continue"
  /** Input handles (`ref`, `expr`, `collect`). */
  inputs: ReactFlowPort[]
  /** Output handles (`item`, `into`). */
  outputs: ReactFlowPort[]
}

/**
 * React Flow node.
 * @category App
 */
export interface ReactFlowNode {
  /** Node id: the execution step id, or a synthetic `ecp:` id for I/O nodes. */
  id: string
  /** Node type for the viewer. */
  type: "ecp-step" | "ecp-io" | "ecp-frame" | "ecp-loop"
  /** Layout position (absolute; the canvas is the execution surface). */
  position: { x: number; y: number }
  /** Node payload. */
  data: ReactFlowStepData | ReactFlowIoData | ReactFlowFrameData | ReactFlowLoopItemsData
  /** Soft size hint from layout. */
  style?: { width?: number; height?: number; pointerEvents?: string }
  /** Draw order; frames sit behind steps. */
  zIndex?: number
}

/**
 * Edge kind. `control` edges are layout-only and never published.
 * @category App
 */
export type ReactFlowEdgeKind = "data" | "control" | "route"

/**
 * Structural route subtype for published non-data edges.
 * @category App
 */
export type ReactFlowRouteKind = "branch" | "parallel" | "loop" | "sequence"

/**
 * One level of route metadata on a structural edge (branch arm, parallel line or loop).
 * @category App
 */
export interface ReactFlowRouteLevel {
  /** Structural subtype at this level. */
  route: ReactFlowRouteKind
  /** Branch, parallel or loop node id in the execution manifest (or an arbitrary id for `sequence`). */
  structureId?: string
  /** Branch arm index or parallel line index. */
  armIndex?: number
  /** Arm or structure label when present. */
  label?: string
  /** Branch arm `expr` or loop `expr` badge text. */
  exprBadge?: string
  /** Full `expr` source for the edge inspector (not the badge). */
  exprSource?: string
  /** True for the branch arm without `expr` (the default arm). */
  defaultArm?: boolean
  /** Loop `maxRounds` (`while` mode). */
  maxRounds?: number
  /** Loop repetition mode when `route` is `loop`. */
  loopMode?: "while" | "for" | "forEach"
  /** Leaf step ids under this arm, line or loop body (for skipped styling). */
  stepIds?: string[]
}

/**
 * Metadata on a published route edge (branch, parallel or loop structure).
 * @category App
 */
export interface ReactFlowRouteEdgeData {
  /** Discriminator. */
  kind: "route"
  /** Structural subtype. */
  route: ReactFlowRouteKind
  /** Branch, parallel or loop node id in the execution manifest (or an arbitrary id for `sequence`). */
  structureId?: string
  /** Branch arm index or parallel line index. */
  armIndex?: number
  /** Arm or structure label when present. */
  label?: string
  /** Branch arm `expr` or loop `expr` source. */
  exprBadge?: string
  /** Full `expr` source for the edge inspector (not the badge). */
  exprSource?: string
  /** True for the branch arm without `expr` (the default arm). */
  defaultArm?: boolean
  /** Loop `maxRounds` (`while` mode). */
  maxRounds?: number
  /** Loop repetition mode when `route` is `loop`. */
  loopMode?: "while" | "for" | "forEach"
  /** True for the visual loop-back edge (excluded from dagre ranks). */
  loopBack?: boolean
  /** Leaf step ids under this arm, line or loop body (for skipped styling). */
  stepIds?: string[]
  /**
   * Structure stack this edge crosses, outermost first. Flat fields on the edge equal `levels[0]`.
   */
  levels: ReactFlowRouteLevel[]
}

/**
 * Data edge payload (published `$ref` / `$expr` bindings).
 * @category App
 */
export interface ReactFlowDataEdgeData {
  /** Discriminator. */
  kind: "data"
  /** Dotted input path on the target step (`targetHandle`). */
  inputPath: string
  /** Manifest binding path (`walkInputRefs` path) for edits. */
  bindingPath?: string
  /** `$script.params` key when the binding is a script param ref. */
  paramKey?: string
  /** State path the edge reads (after `parseStateRef`). */
  statePath: string
}

/**
 * Layout-only control edge between structure nodes.
 * @category App
 */
export interface ReactFlowControlEdgeData {
  /** Discriminator. */
  kind: "control"
}

/**
 * Data or layout-control edge payload.
 * @category App
 */
export type ReactFlowPlainEdgeData = ReactFlowDataEdgeData | ReactFlowControlEdgeData

/**
 * React Flow edge.
 * @category App
 */
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

/**
 * Encoded React Flow document.
 * @category App
 */
export interface ReactFlowDocument {
  /** Nodes. */
  nodes: ReactFlowNode[]
  /** Edges. */
  edges: ReactFlowEdge[]
}

/**
 * JSON Schema I/O for one capability, as `retrieve { type: "capability" }` returns it.
 * @category App
 */
export interface CapabilityIoSchemas {
  /** Capability input JSON Schema. */
  accepts?: JsonSchema
  /** Capability output JSON Schema. */
  returns?: JsonSchema
}

/**
 * Capability id to its JSON Schema I/O, used to draw typed ports.
 * @category App
 */
export type CapabilitySchemaIndex = Record<string, CapabilityIoSchemas>

/**
 * Options for {@link executionToReactFlow}.
 * @category App
 */
export interface ReactFlowEncodeOptions {
  /** Rank direction for dagre. Default `LR`. */
  direction?: "LR" | "TB"
  /** Node width used for layout. */
  nodeWidth?: number
  /** Node height used for layout. */
  nodeHeight?: number
  /** Capability I/O JSON Schemas. Without them, ports come from `input` keys only. */
  capabilitySchemas?: CapabilitySchemaIndex
}

/**
 * Step run status shown on the graph.
 * @category App
 */
export type ReactFlowStepStatus =
  | "idle"
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "cancelled"

/**
 * Detail for `step:status` progress events.
 * @category App
 */
export interface ReactFlowStepStatusDetail {
  /** Execution step id. */
  stepId: string
  /** Status. */
  status: ReactFlowStepStatus
  /** Loop round (0-based) when the step runs inside a loop. */
  round?: number
  /** Loop item index when the step runs inside a `forEach` loop body. */
  item?: number
  /** Failure message for hover tooltips. */
  message?: string
}

/**
 * Detail for `arm:status` progress events (branch arm selection).
 * @category App
 */
export interface ReactFlowArmStatusDetail {
  /** Branch node id. */
  structureId: string
  /** Selected arm index, or `null` when no arm ran. */
  arm: number | null
}

/**
 * Detail for `loop:round` progress events.
 * @category App
 */
export interface ReactFlowLoopRoundDetail {
  /** Loop node id. */
  structureId: string
  /** Current round (0-based). */
  round: number
  /** True when the loop stopped because it reached `maxRounds`. */
  exhausted?: boolean
}

/**
 * Detail for `loop:progress` progress events (`forEach` loop mode).
 * @category App
 */
export interface ReactFlowLoopProgressDetail {
  /** Loop node id. */
  structureId: string
  /** Items completed so far. */
  done: number
  /** Total items (`loop.start` count). */
  count: number
  /** Failed items when `onError: continue`. */
  failed?: number
}


/**
 * Terminal or interrupted outcome of a run, as shown on the graph.
 * @category App
 */
export type ReactFlowRunOutcome = "completed" | "failed" | "cancelled" | "interrupted"

/**
 * Detail for `run:reset` / `run:done`.
 * @category App
 */
export interface ReactFlowRunLifecycleDetail {
  /** Run id when available. */
  runId?: string
  /** Terminal outcome when done. */
  outcome?: ReactFlowRunOutcome
}
