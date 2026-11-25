# Phase 6 — MCP relay

**Goal:** `ecp mcp start` gives any MCP client exactly three tools that behave like the CLI and
HTTP API, survive host restarts, and support the validate-fix loop.

**Depends on:** Phases 4 and 5. **Spec:** 09 (relay), 06.

## Tasks

1. **`mcp-relay` package:** `startRelay({ cwd, home })` with `@modelcontextprotocol/sdk` stdio server; tools `retrieve`, `execute`, `commit` with `inputSchema` from `protocol`; descriptions per 09 (keep them in one module with snapshot tests so wording changes are reviewed).
2. **Host discovery and start:** `host.json` + health; spawn `ecp host start` (resolve the CLI bin from the installed package) when needed; wait 15 s; `ECP_HOST_UNAVAILABLE` with log paths.
3. **Forwarding:** path resolution against `cwd`; `clientRequestId` on `execute`; HTTP calls with token; retries on connection refused / 503 (health poll 250 ms up to 30 s, one retry); run recovery by `clientRequestId` after a dropped connection.
4. **Results:** text content (pretty JSON or formatter text) + `structuredContent`; errors with `isError: true` and issue lines.
5. **Logging:** `logs/relay.log` only; stdout is reserved for MCP frames (test asserts nothing else is written).
6. Wire `ecp mcp start` in the CLI to `startRelay`.

## Tests (E2E with the MCP SDK client over stdio)

- `tools/list` returns exactly three tools with the protocol schemas.
- A1 via MCP: `retrieve` search and id.
- A3 via MCP: validate-fix loop on the 8 broken manifests (structured issues in `structuredContent`).
- `execute` by path relative to the relay cwd; inline manifest; id + patch; `output.path` written relative to cwd.
- A6 via MCP: link a plugin mid-session → next `retrieve` sees it, same session; forced restart during a `delay` run → result says `interrupted` with the resume hint → `execute { resume }` completes.
- No host running at first call → relay starts it; supervisor in `failed` state → `ECP_HOST_UNAVAILABLE`.
- Nothing but MCP frames on stdout (byte-level check).

## Exit criteria

- [x] A1, A3 and A6 pass through MCP (`test/e2e/mcp/relay.test.ts`; CI runs e2e on Ubuntu and Windows).
- [x] Tool descriptions reviewed and snapshot-tested (`packages/mcp-relay/test/descriptions.test.ts`).
- [x] Coverage floors met for `mcp-relay` (helpers unit-tested; stdio/host/forward covered by e2e and excluded like other process entries).
