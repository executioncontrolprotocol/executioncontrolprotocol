/**
 * Core types for the ECP execution engine.
 *
 * These define the lifecycle, run state, and result shapes that
 * flow through the engine during a Context execution.
 *
 * @category Engine
 */

import type {
  ECPContext,
  Executor,
  MountStage,
} from "@ecp/spec";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * Resolved input values for a Context run, keyed by input name.
 *
 * @category Engine
 */
export type ResolvedInputs = Record<string, string | number | boolean>;

// ---------------------------------------------------------------------------
// Mount outputs
// ---------------------------------------------------------------------------

/**
 * A lightweight reference object returned by a seed mount.
 *
 * @category Engine
 */
export interface MountRef {
  /** The unique identifier of the referenced object. */
  id: string;

  /** The source system (e.g. `"jira"`, `"shopify"`). */
  source: string;

  /** Short display title. */
  title?: string;

  /** ISO-8601 timestamp of the last update. */
  updatedAt?: string;

  /** Brief text snippet or summary. */
  snippet?: string;
}

/**
 * The result of hydrating a single mount.
 *
 * @category Engine
 */
export interface MountOutput {
  /** The mount name. */
  mountName: string;

  /** Which hydration stage produced this data. */
  stage: MountStage;

  /**
   * The raw data returned by the tool call.
   * For seed mounts this is typically `MountRef[]`.
   * For focus/deep mounts this is full objects.
   */
  data: unknown;

  /** Number of items returned. */
  itemCount: number;
}

// ---------------------------------------------------------------------------
// Execution state
// ---------------------------------------------------------------------------

/**
 * Lifecycle status of an execution run.
 *
 * @category Engine
 */
export type RunStatus =
  | "pending"
  | "loading"
  | "validating"
  | "hydrating-seed"
  | "running-orchestrator"
  | "delegating"
  | "hydrating-focus"
  | "hydrating-deep"
  | "running-specialist"
  | "merging"
  | "completed"
  | "failed";

/**
 * A log entry recorded during execution.
 *
 * @category Engine
 */
export interface RunLogEntry {
  /** ISO-8601 timestamp. */
  timestamp: string;

  /** Severity level. */
  level: "debug" | "info" | "warn" | "error";

  /** Log message. */
  message: string;

  /** Optional structured data. */
  data?: Record<string, unknown>;
}

/**
 * Budget consumption tracked during an executor's run.
 *
 * @category Engine
 */
export interface BudgetUsage {
  /** Number of tool calls made. */
  toolCalls: number;

  /** Wall-clock runtime in seconds. */
  runtimeSeconds: number;

  /** Estimated cost in USD. */
  costUsd: number;
}

/**
 * Mutable state for a single executor during a run.
 *
 * @category Engine
 */
export interface ExecutorState {
  /** The executor definition from the Context. */
  executor: Executor;

  /** Current status. */
  status: "pending" | "running" | "completed" | "failed";

  /** Mount outputs available to this executor. */
  mountOutputs: MountOutput[];

  /** The structured output this executor produced (if completed). */
  output?: Record<string, unknown>;

  /** Budget consumed so far. */
  budgetUsage: BudgetUsage;

  /** Error message if the executor failed. */
  error?: string;
}

/**
 * The full mutable state of an execution run.
 *
 * @category Engine
 */
export interface RunState {
  /** Unique run ID. */
  runId: string;

  /** The loaded and validated Context. */
  context: ECPContext;

  /** Resolved input values. */
  inputs: ResolvedInputs;

  /** Current lifecycle status. */
  status: RunStatus;

  /** Per-executor mutable state. */
  executors: Map<string, ExecutorState>;

  /** Ordered log entries. */
  log: RunLogEntry[];

  /** Run start time (ISO-8601). */
  startedAt: string;

  /** Run end time (ISO-8601), set when completed or failed. */
  endedAt?: string;
}

// ---------------------------------------------------------------------------
// Execution result
// ---------------------------------------------------------------------------

/**
 * The final result of a completed Context execution.
 *
 * @category Engine
 */
export interface ExecutionResult {
  /** Whether the run completed successfully. */
  success: boolean;

  /** Unique run ID. */
  runId: string;

  /** Context metadata. */
  contextName: string;
  contextVersion: string;

  /** The final structured output (conforms to `orchestration.produces` schema). */
  output?: Record<string, unknown>;

  /** Per-executor outputs, keyed by executor name. */
  executorOutputs: Record<string, Record<string, unknown>>;

  /** Aggregate budget usage across all executors. */
  totalBudgetUsage: BudgetUsage;

  /** Full execution log. */
  log: RunLogEntry[];

  /** Total wall-clock duration in milliseconds. */
  durationMs: number;

  /** Error message if the run failed. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Engine configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for tool servers the engine should connect to.
 * Maps logical server names (as used in mount definitions) to
 * connection details.
 *
 * @category Engine
 */
export type ToolServerRegistry = Record<string, {
  transport: Record<string, unknown>;
}>;

/**
 * Configuration supplied to the engine at initialization.
 *
 * @category Engine
 */
export interface EngineConfig {
  /**
   * Registry of tool servers the engine can connect to.
   * Keys are logical server names matching `mount.from.server`.
   */
  toolServers?: ToolServerRegistry;

  /**
   * A2A endpoint registry for specialist executors.
   * Keys are executor names, values are endpoint URLs.
   */
  agentEndpoints?: Record<string, string>;

  /** Default model to use if an executor doesn't specify one. */
  defaultModel?: string;

  /** Default temperature for model generation. */
  defaultTemperature?: number;

  /** Whether to log debug-level entries. */
  debug?: boolean;
}
