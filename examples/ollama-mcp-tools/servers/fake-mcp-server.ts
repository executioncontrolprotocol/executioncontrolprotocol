#!/usr/bin/env tsx
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "examples-fake-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

const FAKE_ISSUES = [
  { id: "ISS-1", title: "Fix login bug", status: "open", updatedAt: "2025-01-01" },
  { id: "ISS-2", title: "Add dark mode", status: "open", updatedAt: "2025-01-02" },
  { id: "ISS-3", title: "Refactor API", status: "in-progress", updatedAt: "2025-01-03" },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "issues.search",
      description: "Search for issues in a fake tracker",
      inputSchema: {
        type: "object" as const,
        properties: {
          project: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name !== "issues.search") {
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
      isError: true,
    };
  }

  const limit = (args?.limit as number) ?? 5;
  const results = FAKE_ISSUES.slice(0, limit);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(results) }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

