import { Command, Flags } from "@oclif/core"
import { getHost } from "@executioncontrolprotocol/plugin-sdk"
import { serveStdio } from "./serve-stdio.js"
import type { McpToolSet } from "./types.js"

/**
 * `ecp mcp serve` — stdio MCP server on the same host as every other CLI command.
 * HTTP transport lands in Phase 7 PR2.
 * @category MCP
 */
export class McpServeCommand extends Command {
  static id = "mcp:serve"
  static summary = "Serve ECP as an MCP server"
  static description =
    "Expose the process host as MCP tools over stdio. Use --tools meta when a client cannot handle a large capability catalogue."
  static flags = {
    stdio: Flags.boolean({
      description: "Serve over stdio (default)",
      default: true,
      allowNo: false,
    }),
    tools: Flags.string({
      description: "Tool set: all (default) or meta-only",
      options: ["all", "meta"],
      default: "all",
    }),
  }

  async run(): Promise<void> {
    const parsed = await this.parse(McpServeCommand)
    const host = getHost(this.config)
    const tools = parsed.flags.tools as McpToolSet
    await serveStdio({
      host,
      tools,
      config: this.config,
      version: this.config.version,
    })
  }
}

/**
 * oclif explicit command map for this plugin.
 * @category MCP
 */
export const COMMANDS = {
  "mcp:serve": McpServeCommand,
}
