# Ollama + MCP tools (ECP examples)

Legacy documentation note: this folder originally contained v0.5 **Context YAML**
examples showing how to wire MCP tools alongside an Ollama model.

The repository has since moved to the v1 model: portable **workflows**
(`@executioncontrolprotocol.workflow`) executed inside configured **environments** (runtime + extensions +
policies). MCP integration in v1 is primarily represented by:

- `@executioncontrolprotocol/mcp` (package): expose an environment to agents via MCP tools/resources/prompts
- extensions that provide capabilities backed by tool servers (host-specific)

## Prereqs

- Node.js 22+
- (Optional) Ollama running locally

## What is still useful here

This folder still contains a small deterministic stdio MCP server you can reuse for
local wiring tests:

- `servers/fake-mcp-server.ts`

If you want a runnable v1 example for MCP tool wiring, the recommended approach is
to author a dedicated environment module that binds an extension capable of talking
to your MCP server, then run a workflow that invokes that capability.
