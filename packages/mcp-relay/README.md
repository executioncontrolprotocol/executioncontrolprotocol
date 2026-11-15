# `@executioncontrolprotocol/mcp-relay`

Stdio MCP server that exposes exactly three tools — `retrieve`, `execute`, `commit` — and
forwards them to the local host HTTP API. Starts the host if needed.

**Entrypoints:** `src/index.ts` (invoked via `ecp mcp start`)
