import {
  jsonSchemaFromZod,
  type Registry,
} from "@executioncontrolprotocol/core"
import type { z } from "zod"
import { toolDescription } from "./description.js"
import { capabilityToolName } from "./names.js"

/**
 * One generated capability tool. Meta tools are registered separately.
 * @category MCP
 */
export interface McpCapabilityTool {
  /** MCP tool name (`jsonata_transform`). */
  name: string
  /** Capability id invoked through the policy pipeline. */
  capabilityId: string
  /** Summary, description, use cases, and projections. */
  description: string
  /** JSON Schema projected from the capability's zod input schema. */
  inputSchema: Record<string, unknown>
  /** Original zod input schema, when the capability defined one. */
  inputZod?: z.ZodType
}

/**
 * Generate one MCP tool per registered capability.
 * @category MCP
 */
export function toMcpTools(registry: Registry): McpCapabilityTool[] {
  const used = new Set<string>()
  const tools: McpCapabilityTool[] = []
  for (const extension of registry.listExtensions()) {
    for (const capability of extension.capabilities) {
      const name = capabilityToolName(extension.name, capability.name, used)
      tools.push({
        name,
        capabilityId: capability.id,
        description: toolDescription(capability.metadata) || capability.name,
        inputSchema: capability.inputSchema
          ? jsonSchemaFromZod(capability.inputSchema)
          : { type: "object" },
        inputZod: capability.inputSchema,
      })
    }
  }
  return tools
}
