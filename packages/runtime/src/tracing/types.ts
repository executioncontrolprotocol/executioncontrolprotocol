/**
 * Tracing data model for ECP executions.
 *
 * Captures structured spans for every model generation, tool call,
 * mount hydration, and delegation — providing full observability
 * into a Context run.
 *
 * @category Tracing
 */

/**
 * Token usage for a single model generation.
 *
 * @category Tracing
 */
export interface SpanTokenUsage {
  /** Tokens consumed by the prompt/input. */
  prompt: number;

  /** Tokens generated in the response. */
  completion: number;

  /** Total tokens (prompt + completion). */
  total: number;
}

/**
 * The type of work a span represents.
 *
 * @category Tracing
 */
export type SpanType =
  | "executor"
  | "model-generation"
  | "tool-call"
  | "mount-hydration"
  | "delegation";

/**
 * A single span in an execution trace.
 *
 * Spans form a tree: each executor span is the parent of its child
 * model-generation, tool-call, and mount-hydration spans.
 *
 * @category Tracing
 */
export interface TraceSpan {
  /** Unique span identifier. */
  id: string;

  /** Parent span ID (undefined for root executor spans). */
  parentId?: string;

  /** What kind of work this span represents. */
  type: SpanType;

  /** Executor that owns this span. */
  executorName: string;

  /** ISO-8601 start timestamp. */
  startedAt: string;

  /** ISO-8601 end timestamp. */
  endedAt: string;

  /** Duration in milliseconds. */
  durationMs: number;

  /** Model identifier (for model-generation spans). */
  model?: string;

  /** Chain-of-thought or reasoning from the model (when available). */
  reasoning?: string;

  /** Structured output produced by this span. */
  output?: unknown;

  /** Token usage (for model-generation spans). */
  tokens?: SpanTokenUsage;

  /** Qualified tool name, e.g. `"jira:issues.search"` (for tool-call spans). */
  toolName?: string;

  /** Tool call arguments (for tool-call spans). */
  toolArgs?: Record<string, unknown>;

  /** Tool call result (for tool-call spans). */
  toolResult?: unknown;

  /** Whether the tool call returned an error (for tool-call spans). */
  toolIsError?: boolean;

  /** Mount name and stage (for mount-hydration spans). */
  mountName?: string;

  /** Mount stage (for mount-hydration spans). */
  mountStage?: string;

  /** Number of items returned (for mount-hydration spans). */
  mountItemCount?: number;

  /** Error message if this span failed. */
  error?: string;

  /** Sequential step number within the execution (1-based). */
  step: number;
}

/**
 * A complete execution trace capturing every span from a Context run.
 *
 * @category Tracing
 */
export interface ExecutionTrace {
  /** Unique execution/run identifier. */
  executionId: string;

  /** Context name. */
  contextName: string;

  /** Context version. */
  contextVersion: string;

  /** Orchestration strategy used. */
  strategy: string;

  /** ISO-8601 start timestamp. */
  startedAt: string;

  /** ISO-8601 end timestamp. */
  endedAt: string;

  /** Total duration in milliseconds. */
  durationMs: number;

  /** Whether the execution succeeded. */
  success: boolean;

  /** Top-level error message (if failed). */
  error?: string;

  /** Ordered list of all spans in the execution. */
  spans: TraceSpan[];
}

/**
 * Interface for exporting execution traces to external systems.
 *
 * Implement this interface to send traces to observability platforms
 * such as Splunk, New Relic, Datadog, or any custom backend.
 *
 * @category Tracing
 */
export interface TraceExporter {
  /** Human-readable exporter name (e.g. `"splunk"`, `"newrelic"`). */
  readonly name: string;

  /**
   * Export a completed execution trace.
   *
   * @param trace - The execution trace to export.
   */
  export(trace: ExecutionTrace): Promise<void>;
}
