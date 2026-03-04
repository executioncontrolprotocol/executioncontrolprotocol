/**
 * Abstract interface for tool invocation providers.
 *
 * The default implementation delegates to MCP servers using the official
 * MCP TypeScript SDK. The engine never calls tools directly — it always
 * goes through a {@link ToolInvoker}.
 *
 * @category Protocols
 */

/**
 * Metadata about a tool discovered from a server.
 *
 * @category Protocols
 */
export interface DiscoveredTool {
  /** The tool's unique name on its server (e.g. `"issues.search"`). */
  name: string;

  /** Human-readable description. */
  description: string;

  /** JSON Schema describing the tool's accepted parameters. */
  inputSchema: Record<string, unknown>;
}

/**
 * The result of invoking a tool.
 *
 * @category Protocols
 */
export interface ToolResult {
  /** The structured or textual data returned by the tool. */
  content: unknown;

  /** Whether the tool call ended in an error. */
  isError: boolean;
}

/**
 * Options for connecting to a tool server.
 *
 * @category Protocols
 */
export interface ToolServerConfig {
  /** Logical name used to reference this server in the Context (e.g. `"jira"`). */
  name: string;

  /**
   * Transport-specific connection details.
   * For MCP: `{ type: "stdio", command: "...", args: [...] }` or
   *          `{ type: "sse", url: "..." }`.
   */
  transport: Record<string, unknown>;
}

/**
 * Interface for discovering and invoking tools on external servers.
 *
 * @category Protocols
 */
export interface ToolInvoker {
  /** Human-readable name for this invoker implementation. */
  readonly name: string;

  /**
   * Connect to a tool server. Must be called before
   * {@link listTools} or {@link callTool} for that server.
   *
   * @param config - Connection configuration for the server.
   */
  connect(config: ToolServerConfig): Promise<void>;

  /**
   * List all tools available on a connected server.
   *
   * @param serverName - The logical name of the server.
   * @returns The tools the server exposes.
   */
  listTools(serverName: string): Promise<DiscoveredTool[]>;

  /**
   * Invoke a tool on a connected server.
   *
   * @param serverName - The logical name of the server.
   * @param toolName - The tool to invoke.
   * @param args - Arguments to pass to the tool.
   * @returns The tool's result.
   */
  callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult>;

  /**
   * Disconnect from a server and release resources.
   *
   * @param serverName - The logical name of the server to disconnect.
   */
  disconnect(serverName: string): Promise<void>;

  /**
   * Disconnect from all servers and release all resources.
   */
  disconnectAll(): Promise<void>;
}
