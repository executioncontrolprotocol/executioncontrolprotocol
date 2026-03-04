/**
 * Abstract interface for agent-to-agent communication transport.
 *
 * The default implementation uses the official A2A JavaScript SDK.
 * The engine uses this to delegate work from the orchestrator to
 * specialist executors.
 *
 * @category Protocols
 */

/**
 * A reference to a remote agent that can receive delegated tasks.
 *
 * @category Protocols
 */
export interface AgentRef {
  /** The executor name this agent corresponds to. */
  name: string;

  /** Connection endpoint (URL, address, or local identifier). */
  endpoint: string;

  /** Optional protocol version the agent speaks. */
  protocolVersion?: string;
}

/**
 * Capabilities reported by a remote agent.
 *
 * @category Protocols
 */
export interface AgentCapabilities {
  /** Human-readable name the agent reports. */
  name: string;

  /** Skills or task types the agent can handle. */
  skills: string[];

  /** Whether the agent supports streaming responses. */
  supportsStreaming: boolean;
}

/**
 * A task delegated to a remote agent.
 *
 * @category Protocols
 */
export interface DelegatedTask {
  /** Unique task ID assigned by the engine. */
  id: string;

  /** The executor name this task targets. */
  executorName: string;

  /** Free-form task description for the specialist. */
  task: string;

  /** Structured context data provided to the specialist. */
  context: Record<string, unknown>;

  /** Execution hints (priority, token budgets, etc.). */
  hints?: Record<string, unknown>;
}

/**
 * The result of a delegated task returned by a remote agent.
 *
 * @category Protocols
 */
export interface DelegationResult {
  /** The task ID this result corresponds to. */
  taskId: string;

  /** The executor name that produced this result. */
  executorName: string;

  /** The structured output from the specialist. */
  output: Record<string, unknown>;

  /** Whether the task completed successfully. */
  success: boolean;

  /** Error message if the task failed. */
  error?: string;
}

/**
 * Interface for agent-to-agent communication.
 *
 * Used by the ECP engine to delegate tasks from the orchestrator
 * to specialist executors and collect their results.
 *
 * @category Protocols
 */
export interface AgentTransport {
  /** Human-readable name for this transport implementation. */
  readonly name: string;

  /**
   * Query the capabilities of a remote agent.
   *
   * @param agent - Reference to the agent to query.
   * @returns The capabilities the agent reports.
   */
  capabilities(agent: AgentRef): Promise<AgentCapabilities>;

  /**
   * Delegate a task to a remote agent and wait for its result.
   *
   * @param agent - Reference to the target agent.
   * @param task - The task to delegate.
   * @returns The result produced by the agent.
   */
  delegate(agent: AgentRef, task: DelegatedTask): Promise<DelegationResult>;

  /**
   * Release any resources held by this transport.
   */
  close(): Promise<void>;
}
