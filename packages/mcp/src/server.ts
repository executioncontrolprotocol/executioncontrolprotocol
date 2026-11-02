import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerCapabilityTools } from "./capability-tools.js"
import { DEFAULT_MCP_SERVER_NAME } from "./constants.js"
import { registerMetaTools } from "./meta-tools.js"
import { registerResources } from "./resources.js"
import type { McpSessionState } from "./session.js"
import type { CreateEcpMcpServerOptions } from "./types.js"
import { watchPluginManifest } from "./watch.js"

/**
 * Create an MCP server for an initialized ECP host.
 * Capability tools are generated from the registry; meta tools call Ecp / journal / oclif.
 * When `config.dataDir` or `watchDataDir` is set, plugin-manifest changes rebuild the
 * host and send `notifications/tools/list_changed`.
 * @category MCP
 */
export function createEcpMcpServer(options: CreateEcpMcpServerOptions): McpServer {
  const state: McpSessionState = { host: options.host }
  const server = new McpServer({
    name: options.name ?? DEFAULT_MCP_SERVER_NAME,
    version: options.version ?? "0.51.0",
  })
  const capabilityTools: RegisteredTool[] = []

  const refresh = async (): Promise<void> => {
    try {
      const next =
        (await options.rebuildHost?.()) ?? (await state.host.rebuild?.()) ?? state.host
      state.host = next
      if (options.tools !== "meta") {
        for (const tool of capabilityTools) tool.remove()
        capabilityTools.length = 0
        capabilityTools.push(...registerCapabilityTools(server, state))
      }
      if (server.isConnected()) server.sendToolListChanged()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`MCP host rebuild failed: ${message}\n`)
    }
  }

  const withRefresh: CreateEcpMcpServerOptions = {
    ...options,
    onPluginsChanged: async () => {
      await options.onPluginsChanged?.()
      await refresh()
    },
  }

  registerMetaTools(server, withRefresh, state)
  if (options.tools !== "meta") {
    capabilityTools.push(...registerCapabilityTools(server, state))
  }
  registerResources(server, state)

  const dataDir = options.watchDataDir ?? options.config?.dataDir
  if (dataDir) {
    const watcher = watchPluginManifest(dataDir, refresh)
    state.closeWatch = watcher.close
    const originalClose = server.close.bind(server)
    server.close = async () => {
      watcher.close()
      await originalClose()
    }
  }

  return server
}
