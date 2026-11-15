import { Command } from "@oclif/core"

/**
 * `ecp mcp start` — Phase 6 implements the relay.
 * @category CLI
 */
export default class McpStart extends Command {
  static override description = "Start the MCP relay on stdio (Phase 6)."

  override async run(): Promise<void> {
    this.error(
      "ecp mcp start is not available yet. The MCP relay lands in Phase 6 of the realignment.",
      { exit: 1 },
    )
  }
}
