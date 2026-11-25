import commitInput from "@executioncontrolprotocol/protocol/schemas/commit.input.schema.json" with { type: "json" }
import executeInput from "@executioncontrolprotocol/protocol/schemas/execute.input.schema.json" with { type: "json" }
import retrieveInput from "@executioncontrolprotocol/protocol/schemas/retrieve.input.schema.json" with { type: "json" }

/**
 * MCP JSON Schema object (plain object with `type`).
 * @category MCP
 */
export type JsonSchemaObject = Record<string, unknown>

/**
 * Strip meta keys that MCP clients do not need on tool inputSchema.
 * @category MCP
 */
export function asToolInputSchema(schema: Record<string, unknown>): JsonSchemaObject {
  const rest = { ...schema }
  delete rest.$schema
  delete rest.$id
  return rest
}

/**
 * Protocol retrieve input schema for the MCP tool.
 * @category MCP
 */
export const retrieveInputSchema = asToolInputSchema(retrieveInput as Record<string, unknown>)

/**
 * Protocol execute input schema for the MCP tool.
 * @category MCP
 */
export const executeInputSchema = asToolInputSchema(executeInput as Record<string, unknown>)

/**
 * Protocol commit input schema for the MCP tool.
 * @category MCP
 */
export const commitInputSchema = asToolInputSchema(commitInput as Record<string, unknown>)
