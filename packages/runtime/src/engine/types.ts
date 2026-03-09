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
  ExtensionSecurityPolicy,
  MountStage,
} from "@ecp/spec";
import type { ExtensionRegistry } from "../extensions/registry.js";

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

  /** Counter for progress events (step numbers). */
  progressStepCounter?: number;

  /** Counter for step_complete events (completion order: 1, 2, 3...). */
  progressCompleteCounter?: number;

  /** Counter for executor steps only (1, 2, 3... for display). */
  progressExecutorStepCounter?: number;
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

  /** Execution trace (present when tracing is enabled). */
  trace?: import("../tracing/types.js").ExecutionTrace;
}

// ---------------------------------------------------------------------------
// Engine configuration
// ---------------------------------------------------------------------------

/**
 * Execution progress event emitted during a run for real-time UI (e.g. CLI spinner).
 *
 * @category Engine
 */
export type ExecutionProgressEvent =
  | { type: "phase"; status: RunStatus }
  | {
      type: "step_start";
      step: number;
      kind: "mount" | "executor" | "model" | "tool" | "delegation";
      executorName?: string;
      description: string;
    }
  | {
      type: "step_complete";
      step: number;
      kind: "mount" | "executor" | "model" | "tool" | "delegation";
      executorName?: string;
      description: string;
      durationMs: number;
      /** Chain-of-thought or reasoning from the model when available. */
      reasoning?: string;
      /** Executor output when kind is "executor" and the executor produced output. */
      output?: unknown;
      /** Token usage for this step (when kind is "executor", from model generation). */
      tokens?: { prompt: number; completion: number; total: number };
      /** Model used (when kind is "executor"). */
      model?: string;
    }
  | {
      type: "executor_reasoning";
      executorName: string;
      /** Increment or full reasoning text (chain of thought). */
      reasoning: string;
    };

/**
 * Callback invoked for each progress event during execution.
 * May return a Promise so the host can flush output before the next event.
 *
 * @category Engine
 */
export type ProgressCallback = (event: ExecutionProgressEvent) => void | Promise<void>;

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

  /** Override model for all executors (takes precedence over executor config). */
  modelOverride?: string;

  /** Default temperature for model generation. */
  defaultTemperature?: number;

  /** Whether to log debug-level entries. */
  debug?: boolean;

  /** Enable execution tracing. When set, the engine emits trace spans. */
  trace?: boolean;

  /**
   * Optional callback for real-time execution progress (phase, steps, reasoning).
   * May be a single callback or an array; all are invoked for each event.
   */
  onProgress?: ProgressCallback | ProgressCallback[];

  /**
   * Runtime extension registration and security configuration.
   */
  extensions?: ExtensionRuntimeConfig;
}

/**
 * Runtime extension controls supplied by the host system.
 *
 * @category Engine
 */
export interface ExtensionRuntimeConfig {
  /**
   * Extension registry used to resolve providers/executors/plugins.
   */
  registry?: ExtensionRegistry;

  /**
   * Extension IDs enabled for this run (e.g. from CLI --enable or system config).
   * When set, only these extensions may be used. When unset, all providers
   * declared by the context in extensions.providers are allowed.
   */
  enable?: string[];

  /**
   * Allow-list of extension IDs that may be enabled. When set, config.enable
   * must be a subset of this list (typically from system config).
   */
  allowEnable?: string[];

  /**
   * System-level extension loading security policy.
   */
  security?: ExtensionSecurityPolicy;
}

/**
 * System configuration for ECP (e.g. ecp.config.yaml).
 * Used to allow-list enabled extensions and set system security policy.
 * Can be loaded from --config path or default locations.
 *
 * @category Engine
 */
export interface ECPSystemConfig {
  /**
   * Extension allow-list and defaults.
   */
  extensions?: {
    /**
     * Extension IDs that may be enabled at runtime. When set, only these
     * may appear in the runtime enable list (CLI --enable or config.defaultEnable).
     */
    allowEnable?: string[];

    /**
     * Default extension IDs to enable when CLI does not pass --enable.
     */
    defaultEnable?: string[];

    /**
     * System-level extension security policy.
     */
    security?: ExtensionSecurityPolicy;
  };

  /**
   * Progress logger extensions: which loggers to enable and their config.
   * Loggers receive the same progress events as the CLI (phase, steps, reasoning).
   */
  progressLoggers?: {
    /**
     * Default progress logger IDs to enable (e.g. ["file"]).
     */
    defaultEnable?: string[];

    /**
     * Allow-list of progress logger IDs. When set, only these may be enabled.
     */
    allowEnable?: string[];

    /**
     * Per-logger configuration, keyed by logger ID.
     */
    config?: Record<string, Record<string, unknown>>;
  };
}
