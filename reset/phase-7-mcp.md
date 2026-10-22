# Phase 7 — MCP

> Status: Planned · Branch: `feat/phase-7-mcp` · Depends on: Phase 5 · Plan: §4.7 ·
> Can run in parallel with Phases 6 and 8

## Goal

Expose the same capabilities the CLI has as MCP tools, with no per-capability code, so any
MCP client (Claude Desktop, Claude Code, others) can drive ECP. `@executioncontrolprotocol/mcp`
is both a library and a JIT CLI plugin (`ecp mcp serve`).

## Today

`packages/mcp/src/index.ts` (about 440 lines) wraps one `Ecp` instance:

- **Tools:** `ecp.describe_environment`, `ecp.search`, `ecp.validate_workflow`,
  `ecp.run_workflow`, `ecp.encode`, `ecp.decode`, `ecp.get_run_status`.
- **Resources:** environment, capabilities, policies, capability, run.
- **Transports:** stdio and streamable HTTP.
- **Runs** are kept in an in-memory map.

## Tasks

### 1. Package shape

- Keep `packages/mcp` and its package name. It exports:
  - `createEcpMcpServer({ host })`, for embedding.
  - `toMcpTools(registry)`.
  - `src/oclif.ts` with the `mcp serve` command.
- `package.json`: `oclif.commands` (explicit strategy) and the `ecosystem:ecp-plugin` keyword.
- Add `"@executioncontrolprotocol/mcp": "^1"` to the CLI's `oclif.jitPlugins`.

### 2. Host

- `ecp mcp serve` builds the same host as every CLI command (Phase 3): the Node environment,
  the user or `--env` environment layer, and every installed plugin.
- The server therefore sees exactly what `ecp` sees.

### 3. Tools

Tool names must match `^[a-zA-Z0-9_-]{1,64}$` for Claude clients, so the dots go.

**Meta tools** (always registered). These are generated from the CLI's host operations
(Phase 3, `defineOperation`) the same way capability tools are generated from capabilities, so
there's no hand-written tool code:

| Tool | Does | Notes |
| --- | --- | --- |
| `ecp_search` | `ecp search` | |
| `ecp_describe` | `ecp describe` | `format` argument for `toon` |
| `ecp_validate` | `ecp validate` | Accepts a workflow file path **or** workflow source |
| `ecp_run` | `ecp run` | Path or source; returns the envelope plus the run id |
| `ecp_runs_show` | `ecp runs show` | |
| `ecp_runs_rerun` | `ecp runs rerun` | |
| `ecp_invoke` | `ecp invoke` | |
| `ecp_plugins_install` | `ecp plugins install` | Trust policy applies; third-party packages need the client to confirm (`confirm: true` argument, plus the user's approval in the client) |

**Capability tools:** `toMcpTools(registry)` registers one tool per capability:

- Name: `<extension name>_<capability>`, sanitized. Longer than 64 characters → truncate and
  add a 6-character hash.
- Description: the same summary, description and use cases as `--help`.
- Input schema: the capability's zod input schema converted with core's existing
  `schema/json-schema.ts`.
- Calls `ecp.invoke` through the policy pipeline.
- Clients with tool search (Claude Code) load these on demand, so a large catalogue (84
  Firefly tools) costs nothing up front.

Remove `ecp.encode` and `ecp.decode`; format plugins expose `format_toon_encode` and the like
as capability tools.

### 4. Workflow source without files

For clients that can't write files, `ecp_validate` and `ecp_run` accept `source` (Fluent TS
text). It's written to a temp `*.ecp.ts` and loaded through the normal loader, so the
import rules and inference are the same.

### 5. Live updates

- **Tool list:** watch the oclif data directory's plugin manifest (`<dataDir>/package.json`).
  On change, rebuild the host and send `notifications/tools/list_changed`.
- **Run progress:** map the `--events` stream (Phase 4) to MCP progress notifications on the
  `ecp_run` call.

### 6. Transports and security

- **stdio** (the default for local clients).
- **Streamable HTTP:**
  - Binds to `127.0.0.1` by default and requires a bearer token, printed on start.
  - `--host` and `--port` to change; non-loopback binding requires `--allow-remote`.
- **Resources:** keep `ecp://environment`, `ecp://capabilities`, `ecp://policies`,
  `ecp://capability/{id}`, and `ecp://runs/{id}` (read from the journal, not memory).

### 7. Docs

Fill in `guides/mcp` in the docs repo:

- Config snippets for Claude Desktop and Claude Code.
- How tool search finds capability tools.
- The trust and confirmation rules.

## Tests and verification

- **Unit:**
  - `toMcpTools` naming (sanitize, truncate, hash), schemas and descriptions.
  - The meta tools against a test host.
- **Integration (MCP SDK client over stdio):**
  - List tools.
  - Call `jsonata_transform`.
  - Run a workflow from source.
  - Install a plugin and receive `list_changed`.
  - Receive progress during a run.
- **Dogfood B** (§2.4 criterion 8): the three Phase 6 tasks through Claude Desktop connected to
  `ecp mcp serve`, three runs each. Record them in `reset/dogfood/phase-7-<n>.md`.

## Exit criteria

- [ ] `ecp mcp serve` installs on first use (JIT) and serves over stdio and HTTP.
- [ ] Every installed capability is an MCP tool with no per-capability code.
- [ ] `list_changed` and progress notifications work.
- [ ] Dogfood B passes, with records committed.
- [ ] Phase status updated in `reset/README.md` and `RESET-PLAN.md` §7.

## Risks

| Risk | Mitigation |
| --- | --- |
| Clients without tool search choke on hundreds of tools | Add `--tools meta` mode (only meta tools; capabilities reached via `ecp_invoke`), and document when to use it |
| An agent installs plugins without the user knowing | `ecp_plugins_install` needs explicit confirmation for third-party packages, and the trust policy applies to all |
