import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js"
import type { CommitInput, ExecuteInput, RetrieveInput } from "@executioncontrolprotocol/protocol"
import { COMMIT_DESCRIPTION, EXECUTE_DESCRIPTION, RETRIEVE_DESCRIPTION } from "./descriptions.js"
import { formatEnvelope } from "./format.js"
import { forwardCommit, forwardExecute, forwardRetrieve } from "./forward.js"
import { relayLog } from "./log.js"
import { commitInputSchema, executeInputSchema, retrieveInputSchema } from "./schemas.js"
import { VERSION } from "./version.js"

/**
 * Options for {@link startRelay}.
 * @category MCP
 */
export interface StartRelayOptions {
  /** Working directory for relative path resolution. */
  cwd: string
  /** Absolute `ECP_HOME`. Defaults to `process.env.ECP_HOME` or `~/.ecp` is the caller's job. */
  home: string
  /** Absolute path to the `ecp` CLI bin (`.js`). */
  ecpBin: string
}

/**
 * Start the MCP stdio relay and block until the transport closes.
 * @category MCP
 */
export async function startRelay(options: StartRelayOptions): Promise<void> {
  const { cwd, home, ecpBin } = options
  relayLog(home, `relay starting cwd=${cwd}`)

  const server = new Server(
    { name: "ecp", version: VERSION },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "retrieve",
        description: RETRIEVE_DESCRIPTION,
        inputSchema: retrieveInputSchema,
      },
      {
        name: "execute",
        description: EXECUTE_DESCRIPTION,
        inputSchema: executeInputSchema,
      },
      {
        name: "commit",
        description: COMMIT_DESCRIPTION,
        inputSchema: commitInputSchema,
      },
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const name = request.params.name
    const args = (request.params.arguments ?? {}) as Record<string, unknown>
    try {
      if (name === "retrieve") {
        const envelope = await forwardRetrieve({ cwd, home, ecpBin }, args as unknown as RetrieveInput)
        return formatEnvelope(envelope) as CallToolResult
      }
      if (name === "execute") {
        const envelope = await forwardExecute({ cwd, home, ecpBin }, args as unknown as ExecuteInput)
        return formatEnvelope(envelope) as CallToolResult
      }
      if (name === "commit") {
        const envelope = await forwardCommit({ cwd, home, ecpBin }, args as unknown as CommitInput)
        return formatEnvelope(envelope) as CallToolResult
      }
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      }
    } catch (error) {
      const code = (error as { code?: string }).code ?? "ECP_HOST_UNAVAILABLE"
      const message = error instanceof Error ? error.message : String(error)
      const suggestions = (error as { suggestions?: string[] }).suggestions
      relayLog(home, `tool ${name} failed: ${code} ${message}`)
      return formatEnvelope({
        ok: false,
        error: { code, message, suggestions },
      }) as CallToolResult
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  relayLog(home, "relay connected on stdio")
}
