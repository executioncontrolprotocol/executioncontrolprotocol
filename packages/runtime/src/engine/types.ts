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
  PluginSecurityPolicy,
  MountStage,
} from "@executioncontrolprotocol/spec";
import type {
  ExecutionProgressEvent,
  MemoryStore,
  ProgressCallback,
  RunStatus,
  SecretBroker,
  SecretPolicyMode,
  ToolServerCredentialBinding,
} from "@executioncontrolprotocol/plugins";
import type { ExtensionRegistry } from "../extensions/registry.js";

export type { ExecutionProgressEvent, MemoryStore, ProgressCallback, RunStatus };

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
 * One MCP (or other) tool server entry: transport plus optional credential bindings.
 *
 * @category Engine
 */
export interface ToolServerDefinition {
  transport: Record<string, unknown>;

  /**
   * Declarative secret bindings resolved at connect time (stdio env injection).
   * Values are never stored here — only provider ids and lookup keys.
   */
  credentials?: {
    bindings?: ToolServerCredentialBinding[];
  };
}

/**
 * Configuration for tool servers the engine should connect to.
 * Maps logical server names (as used in mount definitions) to
 * connection details.
 *
 * @category Engine
 */
export type ToolServerRegistry = Record<string, ToolServerDefinition>;

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
   * Optional long-term memory store. When set, executors that declare
   * memory (and have memoryAccess policy) can read/write via injected
   * context and tools.
   */
  memoryStore?: MemoryStore;

  /**
   * Optional callback for real-time execution progress (phase, steps, reasoning).
   * May be a single callback or an array; all are invoked for each event.
   */
  onProgress?: ProgressCallback | ProgressCallback[];

  /**
   * Runtime plugin registry and security configuration.
   */
  plugins?: PluginRuntimeConfig;

  /**
   * Resolves {@link ToolServerDefinition.credentials} for MCP stdio transports.
   * When set, stdio servers receive a minimal env plus resolved bindings.
   */
  secretBroker?: SecretBroker;
}

/**
 * Runtime plugin controls supplied by the host system.
 *
 * @category Engine
 */
export interface PluginRuntimeConfig {
  /**
   * Plugin registry used to resolve providers, executors, loggers, memory, …
   */
  registry?: ExtensionRegistry;

  /**
   * Plugin IDs enabled for this run (e.g. from CLI --enable or system config).
   * When set, only these plugins may be used. When unset, all providers
   * declared by the context in `plugins.providers` are allowed.
   */
  enable?: string[];

  /**
   * Allow-list of plugin IDs that may be enabled. When set, config.enable
   * must be a subset of this list (typically from system config).
   */
  allowEnable?: string[];

  /**
   * System-level plugin loading security policy.
   */
  security?: PluginSecurityPolicy;
}

/**
 * System configuration for ECP (e.g. ecp.config.yaml).
 * Used to allow-list enabled plugins and set system security policy.
 * Can be loaded from --config path or default locations.
 *
 * @category Engine
 */
export interface ECPSystemConfig {
  /**
   * Secret provider defaults and policy (values live in providers, not in this file).
   */
  secrets?: {
    /** Preferred provider id for interactive commands (e.g. `os-keychain`). */
    defaultProvider?: string;

    /** How to treat insecure providers (`env`, `dotenv`, `cli-session`). */
    policy?: SecretPolicyMode;

    /** Per-provider toggles and options. */
    providers?: Record<
      string,
      {
        enabled?: boolean;
        /** Dotenv file path (relative to cwd when loading project config). */
        path?: string;
      }
    >;
  };

  /**
   * Plugin allow-list and defaults.
   */
  plugins?: {
    /**
     * Plugin IDs that may be enabled at runtime. When set, only these
     * may appear in the runtime enable list (CLI --enable or config.defaultEnable).
     */
    allowEnable?: string[];

    /**
     * Default plugin IDs to enable when CLI does not pass --enable.
     */
    defaultEnable?: string[];

    /**
     * System-level plugin security policy.
     */
    security?: PluginSecurityPolicy;
  };

  /**
   * Execution loggers: which logger plugins to enable and their config.
   * Loggers receive the same progress events as the CLI (phase, steps, reasoning).
   */
  loggers?: {
    /**
     * Default logger IDs to enable (e.g. ["file"]).
     */
    defaultEnable?: string[];

    /**
     * Allow-list of logger IDs. When set, only these may be enabled.
     */
    allowEnable?: string[];

    /**
     * Per-logger configuration, keyed by logger ID.
     */
    config?: Record<string, Record<string, unknown>>;
  };

  /**
   * Tool server wiring for MCP connections.
   * Maps logical server names (used in Context `mount.from.server` and tool refs)
   * to engine tool-server connection details.
   */
  toolServers?: ToolServerRegistry;

  /**
   * A2A specialist endpoint registry loaded from system config.
   * Keys are executor names, values are endpoint URLs.
   */
  agentEndpoints?: Record<string, string>;

  /**
   * Model-provider defaults and policy controls loaded from system config.
   */
  modelProviders?: {
    openai?: {
      /** Default OpenAI model when CLI/context does not provide one. */
      defaultModel?: string;
      /** Optional allow-list for --model overrides when provider is openai. */
      allowedModels?: string[];
    };
    ollama?: {
      /** Optional Ollama base URL (e.g. http://localhost:11434). */
      baseURL?: string;
      /** Default Ollama model when CLI/context does not provide one. */
      defaultModel?: string;
      /** Optional allow-list for --model overrides when provider is ollama. */
      allowedModels?: string[];
    };
  };
}
