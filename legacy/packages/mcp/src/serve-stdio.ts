import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createEcpMcpServer } from "./server.js"
import type { CreateEcpMcpServerOptions } from "./types.js"

/**
 * Serve MCP over stdio (the default for local clients).
 * Does not write logs to stdout; stdout is the protocol stream.
 * @category MCP
 */
export async function serveStdio(options: CreateEcpMcpServerOptions): Promise<void> {
  const server = createEcpMcpServer(options)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
