import { z } from "zod"
import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js"
import { ECP_STEP_FAILED, EcpError } from "@executioncontrolprotocol/core/types"
import { toolCaught, toolOk } from "./result.js"
import type { McpSessionState } from "./session.js"
import { toMcpTools } from "./to-mcp-tools.js"

function zodShape(schema: z.ZodType | undefined): z.ZodRawShape {
  if (schema instanceof z.ZodObject) return schema.shape as z.ZodRawShape
  return {}
}

/**
 * Register one MCP tool per capability from {@link toMcpTools}.
 * Returns the registrations so a later host rebuild can `remove()` them.
 * @category MCP
 */
export function registerCapabilityTools(
  server: McpServer,
  state: McpSessionState
): RegisteredTool[] {
  const registered: RegisteredTool[] = []
  for (const tool of toMcpTools(state.host.registry)) {
    registered.push(
      server.tool(tool.name, tool.description, zodShape(tool.inputZod), async (args) => {
        const host = state.host
        try {
          const input = tool.inputZod ? tool.inputZod.parse(args) : args
          const result = await host.ecp.invoke(tool.capabilityId).with(input).process()
          await host.recordInvoke?.({
            capabilityId: tool.capabilityId,
            input,
            result: result.result,
            success: result.success,
          })
          if (!result.success) {
            const diagnostic = result.diagnostics[0]
            throw new EcpError(
              diagnostic?.code ?? ECP_STEP_FAILED,
              diagnostic?.message ?? "Capability invoke did not succeed",
              { path: diagnostic?.path, suggestions: diagnostic?.suggestions }
            )
          }
          return toolOk(result.result)
        } catch (err) {
          return toolCaught(err)
        }
      })
    )
  }
  return registered
}
