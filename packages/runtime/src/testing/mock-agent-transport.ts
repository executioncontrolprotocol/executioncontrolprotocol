/**
 * Mock agent transport for deterministic testing.
 *
 * Pre-programmed delegation results keyed by executor name.
 *
 * @category Testing
 */

import type {
  AgentTransport,
  AgentRef,
  AgentCapabilities,
  DelegatedTask,
  DelegationResult,
} from "../protocols/agent-transport.js";

/**
 * A pre-programmed agent response for delegation.
 *
 * @category Testing
 */
export interface MockAgentResponse {
  output: Record<string, unknown>;
  success?: boolean;
  error?: string;
}

/**
 * A recorded delegation made to the mock transport.
 *
 * @category Testing
 */
export interface RecordedDelegation {
  agent: AgentRef;
  task: DelegatedTask;
  timestamp: string;
}

/**
 * Mock implementation of {@link AgentTransport} for unit testing.
 *
 * @category Testing
 */
export class MockAgentTransport implements AgentTransport {
  readonly name = "mock-agent-transport";

  private responses = new Map<string, MockAgentResponse[]>();
  private callIndices = new Map<string, number>();
  readonly delegations: RecordedDelegation[] = [];

  /**
   * Register a response for a specific executor name.
   * Multiple responses are consumed in FIFO order.
   */
  addResponse(executorName: string, response: MockAgentResponse): this {
    if (!this.responses.has(executorName)) {
      this.responses.set(executorName, []);
    }
    this.responses.get(executorName)!.push(response);
    return this;
  }

  async capabilities(agent: AgentRef): Promise<AgentCapabilities> {
    return {
      name: agent.name,
      skills: ["mock-skill"],
      supportsStreaming: false,
    };
  }

  async delegate(
    agent: AgentRef,
    task: DelegatedTask,
  ): Promise<DelegationResult> {
    this.delegations.push({
      agent,
      task,
      timestamp: new Date().toISOString(),
    });

    const responses = this.responses.get(task.executorName) ?? [];
    const idx = this.callIndices.get(task.executorName) ?? 0;
    const responseIdx = Math.min(idx, responses.length - 1);
    const response = responses[responseIdx];
    this.callIndices.set(task.executorName, idx + 1);

    if (!response) {
      return {
        taskId: task.id,
        executorName: task.executorName,
        output: {},
        success: false,
        error: `No mock response configured for "${task.executorName}"`,
      };
    }

    return {
      taskId: task.id,
      executorName: task.executorName,
      output: response.output,
      success: response.success ?? true,
      error: response.error,
    };
  }

  async close(): Promise<void> {}

  reset(): void {
    this.responses.clear();
    this.callIndices.clear();
    this.delegations.length = 0;
  }
}
