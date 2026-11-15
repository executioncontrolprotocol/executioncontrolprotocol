# `@executioncontrolprotocol/cli`

The `ecp` CLI (oclif): `retrieve`, `execute`, `commit`, `host`, `mcp`, `app`, `plugins`,
`secrets`, `schema`.

**Entrypoints:** `bin/ecp.js`, `src/index.ts`

When no host is running, one-off commands use an in-process host. Prefer `ecp host start` for
repeated calls, MCP, and the App.
