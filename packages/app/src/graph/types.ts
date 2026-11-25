import type { CommitMode, JsonSchema } from "@executioncontrolprotocol/protocol"

/**
 * How a step input is supplied on the graph: a literal value, a `$ref` / `$state`
 * path, or a `$script` value.
 * @category App
 */
export type ReactFlowPortBinding = "literal" | "ref" | "script"

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
  /** Input handles. */
  inputs: ReactFlowPort[]
  /** Output handles. */
  outputs: ReactFlowPort[]
}

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
 * Visual band inside a container (`then` / `else`, parallel paths, loop body).
 * @category App
 */
export interface ReactFlowFrameBand {
  /** Layout cluster id for this band. */
  bandId: string
  /** Display label (`then`, `path 1`, …). */
  label: string
  /** Node ids laid out inside this band (excludes the start / end pins). */
  memberNodeIds: string[]
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
  structureKind: "if" | "parallel" | "loop"
  /** Set when `structureKind` is `loop`. */
  loopMode?: "while" | "for" | "forEach"
  /** Node `label`, or the fallback summary. */
  label?: string
  /** Structure start node (`if`, `parallel`, or loop head) pinned on the left edge. */
  startNodeId: string
  /** Loop `end` node pinned on the right edge, when present. */
  endNodeId?: string
  /** Bands inside this container. */
  bands: ReactFlowFrameBand[]
  /**
   * Horizontal divider positions inside the frame (pixels from the frame top), in paint order.
   * Used for `if` then/else separation.
   */
  bandDividerYs?: number[]
  /** Body node ids used to size this frame after layout overrides. */
  memberNodeIds: string[]
  /** Nested frame ids contained in this frame. */
  childFrameIds: string[]
  /** Nesting depth (`0` at the top level). */
  depth: number
}

/** Target handle for a `forEach` loop's `items` input. @category App */
export const LOOP_ITEMS_HANDLE = "items"

/** Target handle for a `for` loop's `count` input. @category App */
export const LOOP_COUNT_HANDLE = "count"

/** Source handle for a loop's current item (`forEach`). @category App */
export const LOOP_ITEM_HANDLE = "item"

/** Source handle for a loop's iteration index (`for` / `forEach`). @category App */
export const LOOP_INDEX_HANDLE = "index"

/** Source handle on an `if` node's taken-side output. @category App */
export const IF_THEN_HANDLE = "then"

/** Source handle on an `if` node's alternate-side output. @category App */
export const IF_ELSE_HANDLE = "else"

/** Prefix for parallel path output handles (`path-1`, `path-2`, …). @category App */
export const PARALLEL_PATH_HANDLE_PREFIX = "path-"

/** Target handle on a loop `end` node for the `repeat` input (`while`). @category App */
export const END_REPEAT_HANDLE = "repeat"

/** Source handle on a loop `end` node's gathered `results` output. @category App */
export const END_RESULTS_HANDLE = "results"

/** @deprecated Old loop `ref` port id; retained for layout tests during migration. @category App */
export const LOOP_REF_HANDLE = "ref"

/** @deprecated Old loop `collect` port id. @category App */
export const LOOP_COLLECT_HANDLE = "collect"

/** Prefix of a loop `end` node's React Flow id (`end:<loopId>`). @category App */
export const END_NODE_PREFIX = "end:"

/**
 * React Flow node id for a loop's synthetic `end` node.
 * @category App
 */
export function loopEndNodeId(loopId: string): string {
  return `${END_NODE_PREFIX}${loopId}`
}

/**
 * Loop id behind a loop `end` node's React Flow id, or `undefined` when `nodeId` is not an `end` node id.
 * @category App
 */
export function loopIdFromEndNodeId(nodeId: string): string | undefined {
  return nodeId.startsWith(END_NODE_PREFIX) && nodeId.length > END_NODE_PREFIX.length
    ? nodeId.slice(END_NODE_PREFIX.length)
    : undefined
}

/**
 * Payload for a loop head structure node on the graph (all loop modes).
 * @category App
 */
/**
 * Payload for a loop start node on the graph.
 * @category App
 */
export interface ReactFlowLoopItemsData {
  /** True when the loop is listed under manifest `detached`. */
  detached?: boolean
  /** Display label (`label`, else the node id). */
  label: string
  /** Loop mode. */
  mode: "while" | "for" | "forEach"
  /** Item state key (`as`), for `for` / `forEach`. */
  as?: string
  /** `into` state key, for `forEach`. */
  into?: string
  /** `maxRounds` for `while` loops. */
  maxRounds?: number
  /** Configured concurrency (default 1), for `forEach`. */
  concurrency?: number
  /** Item error policy, for `forEach`. */
  onError?: "fail" | "continue"
  /** Input handles (`items`, `count`). */
  inputs: ReactFlowPort[]
  /** Output handles (`item`, `index`). */
  outputs: ReactFlowPort[]
}

/**
 * Payload for an `if` condition node on the graph.
 * @category App
 */
export interface ReactFlowIfData {
  detached?: boolean
  label: string
  expression?: string
  as?: string
  inputs: ReactFlowPort[]
  outputs: ReactFlowPort[]
}

/**
 * Payload for a parallel start node on the graph.
 * @category App
 */
export interface ReactFlowParallelData {
  detached?: boolean
  label: string
  pathCount: number
  as?: string
  inputs: ReactFlowPort[]
  outputs: ReactFlowPort[]
}

/**
 * Payload for a loop `end` node on the graph.
 * @category App
 */
export interface ReactFlowEndData {
  detached?: boolean
  /** Parent loop id in the manifest. */
  loopId: string
  label: string
  inputs: ReactFlowPort[]
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
  type: "ecp-step" | "ecp-io" | "ecp-frame" | "ecp-loop" | "ecp-if" | "ecp-parallel" | "ecp-end"
  /** Layout position (absolute; the canvas is the execution surface). */
  position: { x: number; y: number }
  /** Node payload. */
  data:
    | ReactFlowStepData
    | ReactFlowIoData
    | ReactFlowFrameData
    | ReactFlowLoopItemsData
    | ReactFlowIfData
    | ReactFlowParallelData
    | ReactFlowEndData
  /** Soft size hint from layout. */
  style?: { width?: number; height?: number; pointerEvents?: string }
  /** Draw order; frames sit behind steps. */
  zIndex?: number
}

/**
 * Edge kind. `control` edges are layout-only and never published.
 * @category App
 */
export type ReactFlowEdgeKind = "data" | "control"

/**
 * Data edge payload (published `$ref` bindings).
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
  data: ReactFlowPlainEdgeData
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
 * Detail for `if:choice` progress events.
 * @category App
 */
export interface ReactFlowIfChoiceDetail {
  /** `if` node id. */
  ifId: string
  /** Taken side, or `null` when neither side ran. */
  side: "then" | "else" | null
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
