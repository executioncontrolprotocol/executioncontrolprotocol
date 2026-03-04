/**
 * Mock tool invoker for deterministic testing.
 *
 * Pre-programmed tool responses keyed by `server:tool` name.
 *
 * @category Testing
 */

import type {
  ToolInvoker,
  ToolServerConfig,
  DiscoveredTool,
  ToolResult,
} from "../protocols/tool-invoker.js";

/**
 * A pre-programmed tool that the mock will expose.
 *
 * @category Testing
 */
export interface MockTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  responses: MockToolResponse[];
}

/**
 * A pre-programmed response for a tool call.
 * Responses are consumed in FIFO order; the last one is reused indefinitely.
 *
 * @category Testing
 */
export interface MockToolResponse {
  content: unknown;
  isError?: boolean;
}

/**
 * A recorded tool call made to the mock invoker.
 *
 * @category Testing
 */
export interface RecordedToolCall {
  serverName: string;
  toolName: string;
  args: Record<string, unknown>;
  timestamp: string;
}

/**
 * Mock implementation of {@link ToolInvoker} for unit testing.
 *
 * @category Testing
 */
export class MockToolInvoker implements ToolInvoker {
  readonly name = "mock-tool-invoker";

  private servers = new Map<string, Map<string, { tool: MockTool; callIndex: number }>>();
  readonly calls: RecordedToolCall[] = [];

  /**
   * Register a mock tool on a server.
   */
  addTool(serverName: string, tool: MockTool): this {
    if (!this.servers.has(serverName)) {
      this.servers.set(serverName, new Map());
    }
    this.servers.get(serverName)!.set(tool.name, { tool, callIndex: 0 });
    return this;
  }

  /**
   * Convenience: register a tool that always returns the same data.
   */
  addSimpleTool(
    serverName: string,
    toolName: string,
    response: unknown,
  ): this {
    return this.addTool(serverName, {
      name: toolName,
      description: `Mock ${toolName}`,
      inputSchema: { type: "object" },
      responses: [{ content: response }],
    });
  }

  async connect(_config: ToolServerConfig): Promise<void> {
    // no-op for mock
  }

  async listTools(serverName: string): Promise<DiscoveredTool[]> {
    const server = this.servers.get(serverName);
    if (!server) return [];

    return [...server.values()].map((entry) => ({
      name: entry.tool.name,
      description: entry.tool.description,
      inputSchema: entry.tool.inputSchema,
    }));
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    this.calls.push({
      serverName,
      toolName,
      args,
      timestamp: new Date().toISOString(),
    });

    const server = this.servers.get(serverName);
    const entry = server?.get(toolName);

    if (!entry) {
      return {
        content: { error: `Mock tool ${serverName}:${toolName} not found` },
        isError: true,
      };
    }

    const { tool, callIndex } = entry;
    const responseIdx = Math.min(callIndex, tool.responses.length - 1);
    const response = tool.responses[responseIdx];
    entry.callIndex++;

    if (!response) {
      return { content: null, isError: true };
    }

    return {
      content: response.content,
      isError: response.isError ?? false,
    };
  }

  async disconnect(_serverName: string): Promise<void> {}
  async disconnectAll(): Promise<void> {}

  reset(): void {
    this.servers.clear();
    this.calls.length = 0;
  }
}
