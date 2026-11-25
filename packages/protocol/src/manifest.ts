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
 * Transform step script (`code: "script"`). Syntax-checked at validation; run in QuickJS.
 * Exactly one of `source` and `path`.
 * @category Definitions
 */
export interface ScriptDescriptor {
  /** Language. Only `js` in the MVP. */
  lang: "js"
  /** Inline source. */
  source?: string
  /** Path relative to the execution file, or absolute for inline executions. */
  path?: string
  /** Acorn `ecmaVersion`. Default 2020. */
  ecmaVersion?: number
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
  /** Transform script (`code: "script"`). */
  script?: ScriptDescriptor
  /** JSONata or other expression source (`code: "expression"`). */
  expression?: string
  /** State key for the output. */
  as?: string
  /** Commit mode. Requires `as`. */
  mode?: CommitMode
  /** When false, skip uniform capture of output file refs for this step. Default true. */
  persist?: boolean
}

/**
 * Condition node. `true` runs {@link IfNode.then}; `false` and any failure run {@link IfNode.else}.
 * @category Definitions
 */
export interface IfNode {
  /** Node kind. */
  type: "if"
  /** Unique node id. */
  id: string
  /** Display label. */
  label?: string
  /** Input port types for the condition. */
  accepts?: Record<string, unknown>
  /** Branches into input ports. */
  input?: Record<string, JsonValue | ValueMarker>
  /** Condition expression over frozen `input`. Exactly one of `expression` and `script`. */
  expression?: string
  /** Condition script body with `return`. Exactly one of `expression` and `script`. */
  script?: ScriptDescriptor
  /** Scoped alias for the resolved input inside `then` / `else`. Requires `input`. */
  as?: string
  /** Nodes when the condition is true. At least one. */
  then: Node[]
  /** Nodes when the condition is false or failed. */
  else?: Node[]
}

/**
 * Loop end node. Gathers each round's result and, in `while` mode, carries `repeat`.
 * @category Definitions
 */
export interface LoopEndNode {
  /** Typed inputs from the loop body. */
  accepts?: Record<string, unknown>
  /** Values bound into the end node, including `repeat` for `while`. */
  input: Record<string, JsonValue | ValueMarker>
  /** Gather expression over frozen `input`. Exactly one of `expression` and `script` when set. */
  expression?: string
  /** Gather script with `return`. Exactly one of `expression` and `script` when set. */
  script?: ScriptDescriptor
  /** Schema for one gathered value. */
  returns?: Record<string, unknown>
}

/**
 * Loop. `mode` selects how it repeats: `while` (default), `for` or `forEach`.
 * @category Definitions
 */
export interface LoopNode {
  /** Node kind. */
  type: "loop"
  /** Unique node id. */
  id: string
  /** Display label. */
  label?: string
  /** How the loop repeats. Default `while`. */
  mode?: "while" | "for" | "forEach"
  /** Driver inputs: `items` for `forEach`, `count` for `for`; omitted for `while`. */
  input?: Record<string, JsonValue | ValueMarker>
  /** Iteration or item key for `for` and `forEach` modes. */
  as?: string
  /** Inclusive upper bound for `while` mode, 1..1000. */
  maxRounds?: number
  /** Body. */
  steps: Node[]
  /** End node that gathers results and reads `repeat` in `while` mode. */
  end: LoopEndNode
  /** State key for collected results (`forEach` required; optional for `for` / `while`). */
  into?: string
  /** Concurrent items in `forEach` mode. Default 1, max {@link MAX_LOOP_CONCURRENCY}. */
  concurrency?: number
  /** Whether one failed item fails the run in `forEach` mode. Default `fail`. */
  onError?: "fail" | "continue"
}

/**
 * Concurrent lists of nodes. Each path runs in order.
 * @category Definitions
 */
export interface ParallelNode {
  /** Node kind. */
  type: "parallel"
  /** Unique node id. */
  id: string
  /** Display label. */
  label?: string
  /** Optional shared input ports. */
  accepts?: Record<string, unknown>
  /** Branches into shared input ports. */
  input?: Record<string, JsonValue | ValueMarker>
  /** Scoped alias for the resolved input on every path. Requires `input`. */
  as?: string
  /** Maximum paths in flight. Default is the host setting (4). */
  maxConcurrency?: number
  /** At least two paths, each with at least one node. */
  paths: Node[][]
}

/**
 * Any node in an execution.
 * @category Definitions
 */
export type Node = StepNode | IfNode | LoopNode | ParallelNode

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
  /** Nodes removed from the flow. Omit when empty. Never run. Ids are unique with `steps`. */
  detached?: Node[]
}
