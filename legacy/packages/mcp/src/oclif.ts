import { Command, Flags } from "@oclif/core"
import { getHost } from "@executioncontrolprotocol/plugin-sdk"
import {
  DEFAULT_MCP_HOST,
  DEFAULT_MCP_PORT,
} from "./constants.js"
import { serveHttp } from "./serve-http.js"
import { serveStdio } from "./serve-stdio.js"
import type { McpToolSet } from "./types.js"

/**
 * `ecp mcp serve` — MCP server on the same host as every other CLI command.
 * stdio is the default; `--http` binds loopback and prints a bearer token once.
 * @category MCP
 */
export class McpServeCommand extends Command {
  static id = "mcp:serve"
  static summary = "Serve ECP as an MCP server"
  static description =
    "Expose the process host as MCP tools. stdio is the default (stdout is the protocol stream). --http binds 127.0.0.1 and requires a bearer token printed once to stderr. Use --tools meta when a client cannot handle a large capability catalogue."
  static flags = {
    stdio: Flags.boolean({
      description: "Serve over stdio (default)",
      default: true,
      allowNo: false,
    }),
    http: Flags.boolean({
      description: "Serve over streamable HTTP instead of stdio",
      default: false,
    }),
    host: Flags.string({
      description: "HTTP bind address (loopback by default)",
      default: DEFAULT_MCP_HOST,
    }),
    port: Flags.integer({
      description: "HTTP bind port",
      default: DEFAULT_MCP_PORT,
    }),
    "allow-remote": Flags.boolean({
      description: "Allow binding HTTP beyond loopback",
      default: false,
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
    const shared = {
      host,
      tools,
      config: this.config,
      version: this.config.version,
    }
    if (parsed.flags.http) {
      await serveHttp({
        ...shared,
        httpHost: parsed.flags.host,
        httpPort: parsed.flags.port,
        allowRemote: parsed.flags["allow-remote"],
        block: true,
      })
      return
    }
    await serveStdio(shared)
  }
}

/**
 * oclif explicit command map for this plugin.
 * @category MCP
 */
export const COMMANDS = {
  "mcp:serve": McpServeCommand,
}
