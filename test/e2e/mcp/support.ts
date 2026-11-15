import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  createCliHome,
  ecpBin,
  fixturesRoot,
  pluginTestRoot,
  runEcp,
  waitForHost,
} from "../cli/support.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

export { createCliHome, ecpBin, fixturesRoot, pluginTestRoot, runEcp, waitForHost, repoRoot }

/**
 * Open an MCP client against `ecp mcp start` in a hermetic home.
 * @category Test
 */
export async function openMcpSession(options: {
  env: NodeJS.ProcessEnv
  cwd?: string
}): Promise<{ client: Client; transport: StdioClientTransport; close: () => Promise<void> }> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(options.env)) {
    if (value !== undefined) env[key] = value
  }
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [ecpBin, "mcp", "start"],
    cwd: options.cwd ?? repoRoot,
    env,
    stderr: "pipe",
  })
  const client = new Client({ name: "ecp-e2e", version: "2.0.0" })
  await client.connect(transport)
  return {
    client,
    transport,
    close: async () => {
      await client.close().catch(() => undefined)
      await transport.close().catch(() => undefined)
    },
  }
}

/**
 * Call a tool and return text + structuredContent.
 * @category Test
 */
export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<{
  isError?: boolean
  text: string
  structuredContent?: Record<string, unknown>
}> {
  const result = await client.callTool({ name, arguments: args })
  const content = result.content as Array<{ type: string; text?: string }>
  const text = content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
  return {
    isError: result.isError === true ? true : undefined,
    text,
    structuredContent: result.structuredContent as Record<string, unknown> | undefined,
  }
}
