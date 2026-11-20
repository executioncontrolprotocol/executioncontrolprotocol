/**
 * JSON value stored in an execution. Markers are objects with one of the
 * reserved keys; see {@link ValueMarker}.
 * @category Definitions
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

/**
 * Reference to a state path. Missing plus `optional` yields `fallback` when
 * set, otherwise the property is omitted.
 * @category Definitions
 */
export interface RefMarker {
  /** Path beginning with `state.`. */
  $ref: string
  /** When true, a missing value does not fail resolution. */
  optional?: boolean
  /** Value used when the path is missing and `optional` is true. */
  fallback?: JsonValue
}

/**
 * Handle passed to a capability so it can stage writes through `ctx.store`.
 * @category Definitions
 */
export interface StateMarker {
  /** Path segments without the `state.` prefix. */
  $state: string
}

/**
 * Expression evaluated in QuickJS. The result must be JSON.
 * @category Definitions
 */
export interface ExprMarker {
  /** JavaScript function source, one parameter at most. */
  $expr: string
}

/**
 * Script text the host syntax-checks and never runs. Resolves to a string.
 * @category Definitions
 */
export interface ScriptMarker {
  /** Script descriptor. Exactly one of `source` and `path`. */
  $script: {
    /** Language. Only `js` in the MVP. */
    lang: "js"
    /** Inline source. */
    source?: string
    /** Path relative to the execution file, or absolute for inline executions. */
    path?: string
    /** Values folded into the resolved string as `const params = …`. */
    params?: Record<string, JsonValue | RefMarker | ExprMarker>
    /** Acorn `ecmaVersion`. Default 2020. */
    ecmaVersion?: number
  }
}

/**
 * A value marker inside `input` or `$script.params`.
 * @category Definitions
 */
export type ValueMarker = RefMarker | StateMarker | ExprMarker | ScriptMarker

/**
 * How a step writes its output into state. `create` is the default.
 * @category Definitions
 */
export type CommitMode = "create" | "replace" | "merge" | "append"

/**
 * Capability step. Absent `type` means `step`.
 * @category Definitions
 */
export interface StepNode {
  /** Node kind. Absent or `"step"`. */
  type?: "step"
  /** Unique node id. */
  id: string
  /** Display label. */
  label?: string
  /** Capability id `@scope/name.capability`. */
  uses: string
  /** Config object id `<plugin-short>/<name>`. */
  config?: string
  /** Gate. `false` skips the step. */
  expr?: string
  /** Input, validated against the capability `accepts` after markers resolve. */
  input?: Record<string, JsonValue | ValueMarker>
  /**
   * Step input contract (JSON Schema). Used when the capability `contract` is `"step"`.
   */
  accepts?: Record<string, unknown>
  /**
   * Step output contract (JSON Schema). Used when the capability `contract` is `"step"`.
   */
  returns?: Record<string, unknown>
  /** Transform script (`code: "script"`). Syntax-checked at validation; run in QuickJS. */
  script?: ScriptMarker
  /** JSONata or other expression source (`code: "expression"`). */
  expression?: string
  /** State key for the output. */
  as?: string
  /** Commit mode. Requires `as`. */
  mode?: CommitMode
}

/**
 * One arm of a branch. An arm without `expr` is the default and must be last.
 * @category Definitions
 */
export interface BranchArm {
  /** Display label. */
  label?: string
  /** When omitted, this is the default arm. */
  expr?: string
  /** Nodes to run when the arm is selected. */
  steps: Node[]
}

/**
 * Ordered arms. The first arm whose `expr` is true runs.
 * @category Definitions
 */
export interface BranchNode {
  /** Node kind. */
  type: "branch"
  /** Unique node id. */
  id: string
  /** Display label. */
  label?: string
  /** Arms, at least one. */
  branches: BranchArm[]
}

/**
 * Loop. `expr` is evaluated before every round, including the first.
 * @category Definitions
 */
export interface LoopNode {
  /** Node kind. */
  type: "loop"
  /** Unique node id. */
  id: string
  /** Display label. */
  label?: string
  /** `true` runs a round. */
  expr: string
  /** Inclusive upper bound, 1..1000. Reaching it ends the loop normally. */
  maxRounds: number
  /** Body. */
  steps: Node[]
}

/**
 * Concurrent lists of nodes. Each list runs in order.
 * @category Definitions
 */
export interface ParallelNode {
  /** Node kind. */
  type: "parallel"
  /** Unique node id. */
  id: string
  /** Display label. */
  label?: string
  /** Maximum lists in flight. Default is the host setting (4). */
  maxConcurrency?: number
  /** At least two lists, each with at least one node. */
  branches: Node[][]
}

/**
 * Any node in an execution.
 * @category Definitions
 */
export type Node = StepNode | BranchNode | LoopNode | ParallelNode

/**
 * Optional document metadata. `id` is required to commit.
 * @category Definitions
 */
export interface ExecutionBlock {
  /** Stable id, `^[a-z0-9][a-z0-9-]{0,63}$`. */
  id?: string
  /** Display label. */
  label?: string
  /** Display description. */
  description?: string
  /** JSON Schema (`type: object`) for run input. Properties seed state. */
  accepts?: Record<string, JsonValue>
  /** JSON Schema (`type: object`) selecting result keys from state. */
  returns?: Record<string, JsonValue>
}

/**
 * Execution manifest, schema `@executioncontrolprotocol.execution` version `2.0`.
 * @category Definitions
 */
export interface ExecutionManifest {
  /** Editor hint. Ignored by the host. */
  $schema?: string
  /** Always `@executioncontrolprotocol.execution`. */
  schema: "@executioncontrolprotocol.execution"
  /** Always `2.0`. */
  version: "2.0"
  /** Optional metadata block. */
  execution?: ExecutionBlock
  /** Top-level nodes. At least one. */
  steps: Node[]
}
