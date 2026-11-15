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
  static override description = "Start the MCP relay on stdio."

  override async run(): Promise<void> {
    await this.parse(McpStart)
    const home = ecpHome()
    const ecpBin = resolveEcpBin()
    // Blocks until the MCP client closes stdio. Do not write to stdout.
    await startRelay({
      cwd: process.cwd(),
      home,
      ecpBin,
    })
  }
}

function resolveEcpBin(): string {
  // When launched as `node …/bin/ecp.js …`, argv[1] is the bin.
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
