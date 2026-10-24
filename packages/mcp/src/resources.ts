import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import { listRunJournals, readRunJournal } from "@executioncontrolprotocol/node"
import type { EcpHost } from "@executioncontrolprotocol/plugin-sdk"
import { JSON_MIME } from "./constants.js"
import { jsonContents } from "./result.js"

/**
 * Register discovery and journal-backed run resources.
 * @category MCP
 */
export function registerResources(server: McpServer, host: EcpHost): void {
  const ecp = host.ecp

  server.registerResource(
    "environment",
    "ecp://environment",
    {
      title: "Environment descriptor",
      description: "Full ECP environment descriptor: extensions, capabilities, policies.",
      mimeType: JSON_MIME,
    },
    async (uri) => jsonContents(uri, await ecp.describe(), JSON_MIME)
  )

  server.registerResource(
    "capabilities",
    "ecp://capabilities",
    {
      title: "Capabilities",
      description: "All capabilities available in this environment.",
      mimeType: JSON_MIME,
    },
    async (uri) => jsonContents(uri, (await ecp.describe()).capabilities, JSON_MIME)
  )

  server.registerResource(
    "policies",
    "ecp://policies",
    {
      title: "Policies",
      description: "All policies governing this environment.",
      mimeType: JSON_MIME,
    },
    async (uri) => jsonContents(uri, (await ecp.describe()).policies, JSON_MIME)
  )

  server.registerResource(
    "capability",
    new ResourceTemplate("ecp://capability/{+id}", {
      list: async () => {
        const descriptor = await ecp.describe()
        return {
          resources: descriptor.capabilities.map((c) => ({
            uri: `ecp://capability/${c.id}`,
            name: c.id,
            ...(c.label ? { title: c.label } : {}),
            mimeType: JSON_MIME,
          })),
        }
      },
    }),
    {
      title: "Capability detail",
      description: "A single capability's schemas and metadata by id.",
      mimeType: JSON_MIME,
    },
    async (uri, variables) => {
      const id = String(variables.id)
      const descriptor = await ecp.describe()
      const capability = descriptor.capabilities.find((c) => c.id === id)
      return jsonContents(uri, capability ?? { error: "Capability not found", id }, JSON_MIME)
    }
  )

  server.registerResource(
    "run",
    new ResourceTemplate("ecp://runs/{runId}", {
      list: async () => {
        const docs = await listRunJournals()
        return {
          resources: docs.map((doc) => ({
            uri: `ecp://runs/${doc.runId}`,
            name: doc.runId,
            mimeType: JSON_MIME,
          })),
        }
      },
    }),
    {
      title: "Run journal",
      description: "Run journal read from disk, not an in-memory map.",
      mimeType: JSON_MIME,
    },
    async (uri, variables) => {
      const runId = String(variables.runId)
      try {
        return jsonContents(uri, await readRunJournal(runId), JSON_MIME)
      } catch {
        return jsonContents(uri, { error: "Run not found", runId }, JSON_MIME)
      }
    }
  )
}
