import { fileURLToPath } from "node:url"
import path from "node:path"
import { Command } from "@oclif/core"
import { startRelay } from "@executioncontrolprotocol/mcp-relay"
import { ecpHome } from "../../lib/home.js"

/**
 * `ecp mcp start` — MCP stdio relay for retrieve / execute / commit.
 * @category CLI
 */
export default class McpStart extends Command {
  static override description =
    "Run the MCP relay on stdio (no --json); use when the agent connects over MCP instead of the CLI."

  static override examples = [
    {
      description: "Starts the relay; stdout is reserved for MCP frames only.",
      command: "<%= config.bin %> mcp start",
    },
  ]

  override async run(): Promise<void> {
    await this.parse(McpStart)
    const home = ecpHome()
    const ecpBin = resolveEcpBin()
    await startRelay({
      cwd: process.cwd(),
      home,
      ecpBin,
    })
  }
}

function resolveEcpBin(): string {
  const argvBin = process.argv[1]
  if (argvBin && (argvBin.endsWith("ecp.js") || argvBin.endsWith(`${path.sep}ecp`) || argvBin.endsWith("/ecp"))) {
    return path.resolve(argvBin)
  }
  try {
    return fileURLToPath(import.meta.resolve("@executioncontrolprotocol/cli/bin/ecp.js"))
  } catch {
    const here = path.dirname(fileURLToPath(import.meta.url))
    return path.resolve(here, "../../../bin/ecp.js")
  }
}