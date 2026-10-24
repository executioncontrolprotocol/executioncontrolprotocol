import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerCapabilityTools } from "./capability-tools.js"
import { DEFAULT_MCP_SERVER_NAME } from "./constants.js"
import { registerMetaTools } from "./meta-tools.js"
import { registerResources } from "./resources.js"
import type { CreateEcpMcpServerOptions } from "./types.js"

/**
 * Create an MCP server for an initialized ECP host.
 * Capability tools are generated from the registry; meta tools call Ecp / journal / oclif.
 * @category MCP
 */
export function createEcpMcpServer(options: CreateEcpMcpServerOptions): McpServer {
  const server = new McpServer({
    name: options.name ?? DEFAULT_MCP_SERVER_NAME,
    version: options.version ?? "1.0.0-next.0",
  })

  registerMetaTools(server, options)
  if (options.tools !== "meta") {
    registerCapabilityTools(server, options.host)
  }
  registerResources(server, options.host)
  return server
}
