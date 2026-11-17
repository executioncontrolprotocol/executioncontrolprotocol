# 09 — Host, supervisor, relay

## Processes

| Process | Started by | Lives | Holds |
| --- | --- | --- | --- |
| Supervisor | `ecp host start` (also auto-started by `ecp mcp start` and `ecp app`) | Until `ecp host stop` | Port, token, `host.json`, the host child, restart logic, control port |
| Host | Supervisor (`node <host>/dist/main.js`) | Restarted on plugin change or crash | Engine, services, loaded plugins, HTTP API, App bundle |
| MCP relay | MCP client running `ecp mcp start` | The MCP session | Stdio MCP server; forwards to the host API |
| One-off CLI | User/agent | One command | Calls the host API if up, else an in-process host |

## `host.json` (`$ECP_HOME/host.json`, mode 0600 on POSIX; default user ACL on Windows)

```json
{ "schema": "@executioncontrolprotocol.host", "version": "1.0",
  "supervisorPid": 4100, "hostPid": 4120, "port": 51234, "controlPort": 51235,
  "token": "<43-char base64url>", "hostVersion": "1.0.0", "startedAt": "…", "home": "/home/u/.ecp" }
```

Written atomically by the supervisor before the first host spawn, rewritten on each restart
(new `hostPid`, same `port`, `controlPort`, `token`). Deleted on clean stop.

## Supervisor

- Entry: `packages/host/dist/supervisor.js`. Spawned with `detached: true`, `stdio` to
  `logs/supervisor.log`, then `unref()`; the CLI waits for `host.json` + host health (15 s)
  and reports.
- Picks two free ports on `127.0.0.1` (bind port 0, read, close), generates the token
  (32 random bytes, base64url).
- Spawns the host with env `ECP_HOME`, `ECP_HOST_PORT`, `ECP_HOST_TOKEN`, `ECP_SUPERVISOR_PID`
  (the supervisor's `process.pid`; never argv), stdio to `logs/host.log`. If the host exits with
  `EADDRINUSE` on start, pick a new port, rewrite `host.json`, retry (max 3).
- **Orphan safety (same 2 s poll as the plugin marker):** while not already stopping, if
  `ECP_HOME` is missing, `host.json` is missing, or a readable `host.json` has a different
  `token` or `supervisorPid` than this process, force-stop (drain timeout `0`), kill the host
  child, delete `host.json` if present, and exit. A single failed read (sharing violation, partial
  write) does nothing until the next poll. Deleting `~/.ecp` or `host.json` while a host is running
  therefore stops it within about 2 seconds.
- On `process.exit`, synchronously `kill()` the host child if it has not exited (orderly `/stop` and
  POSIX signals; not `SIGKILL` / Windows `TerminateProcess` on the supervisor).
- **Control server** on `controlPort` (same token, same Host-header check):
  `GET /status` → `{ supervisorPid, hostPid, hostStatus, restarts, lastRestartReason }`;
  `POST /restart { force?: boolean }`; `POST /stop { force?: boolean }`.
- **Plugin changes:** watch `$ECP_DATA_DIR/.ecp-plugins-changed` (`fs.watch` + 2 s poll
  fallback), debounce 500 ms, then restart.
- **Restart protocol:**
  1. `POST host /v1/admin/drain { timeoutMs: 30000 }` (or `0` with `force`). The host stops
     accepting `execute` runs (503 `ECP_HOST_RESTARTING`, `retryAfterMs: 1000`); `retrieve`,
     validate-only `execute`, and `commit` keep working; it waits for active runs, then marks
     the rest `interrupted` and replies.
  2. `POST host /v1/admin/shutdown`; wait for exit (5 s, then kill).
  3. Spawn the new host on the same port; wait for `/v1/health` `ok` (15 s).
- **Crash:** unexpected exit → restart with backoff 1 s, 2 s, 4 s … max 30 s; the backoff resets
  after 60 s healthy. More than 10 crashes in 10 minutes → stop restarting, `hostStatus:
  "failed"` in `/status`, and the CLI and relay report `ECP_HOST_UNAVAILABLE` with the log
  path.
- **Stop:** drain (unless `force`), shutdown host, delete `host.json`, exit.

## Host process

- Entry: `packages/host/dist/main.js` → `createLocalHost({ mode: "server", port, token })`.
- When `ECP_SUPERVISOR_PID` is set (supervisor-spawned host only, not in-process tests), poll that
  pid every 2 s with `process.kill(pid, 0)`; if the supervisor is gone, drain and exit (covers
  abrupt supervisor death on Windows where parent links are unreliable).
- On start: mark leftover `running` runs `interrupted`; build registry from manifests; mark the
  HTTP endpoint ready, then write the root editor schema and per-plugin editor schema files under
  `$ECP_HOME/schema/plugins/` (relative `$ref`s to `#/$defs/<name>.editorInput`); runtime
  validation does not compile these files; log a timing line.
- Graceful shutdown on `/v1/admin/shutdown` and on SIGTERM/SIGINT (POSIX).

## HTTP API (`HttpApiEndpoint`, `node:http`, no framework)

| Route | Auth | Body → response |
| --- | --- | --- |
| `GET /v1/health` | none | `{ status: "starting" \| "ok" \| "draining", version, pid, startedAt, plugins: n, activeRuns: n }` |
| `POST /v1/retrieve` | token | `RetrieveInput` → envelope |
| `POST /v1/execute` | token | `ExecuteInput` → envelope |
| `POST /v1/commit` | token | `CommitInput` → envelope |
| `GET /v1/watch?types=run,execution,config&runId=…&path=…` | token | Server-sent events stream: storage changes, run events (04), and changes to an execution file and its `$script.path` files (`path`, App hot reload); heartbeat comment every 15 s |
| `GET /v1/file?path=<absolute>` | token | Read-only text of a `.ecp.json` file or a `$script.path` it references (App); max 2 MB |
| `GET /v1/files?dir=<absolute>` | token | `*.ecp.json` files under `dir`, depth 3, max 200, skipping `node_modules` and dot-folders (App home) |
| `POST /v1/admin/drain` | token | `{ timeoutMs }` → `{ interrupted: [runIds] }` |
| `POST /v1/admin/shutdown` | token | `{}` → `{}` then exit |
| `GET /app/*` | none for the static bundle; the App's API calls need the token | Prebuilt App |
| `GET /` | none | 302 → `/app/` |

- Bodies: JSON, max 10 MB (`413` with `ECP_REQUEST_INVALID` above it).
- Responses: the envelope (06) with the HTTP status from the catalogue; `Content-Type:
  application/json; charset=utf-8`.
- **Auth:** `Authorization: Bearer <token>`, constant-time compare → else 401
  `ECP_UNAUTHORIZED`.
- **Host header:** must be `127.0.0.1:<port>` or `localhost:<port>` → else 401 (DNS-rebinding
  protection). **Origin:** if present, must equal `http://127.0.0.1:<port>` or
  `http://localhost:<port>` → else 401. No CORS headers are ever sent.
- Binds `127.0.0.1` only. Never `0.0.0.0`.
- Request ids: every response has `X-Ecp-Request-Id`; logs include it.

## MCP relay (`mcp-relay`)

- `ecp mcp start` runs `startRelay({ cwd: process.cwd() })`: an MCP server over stdio
  (`@modelcontextprotocol/sdk`, server name `ecp`, version = package version) with exactly three
  tools: `retrieve`, `execute`, `commit`. No resources, prompts or other tools.
- Tool `inputSchema` = the operation input schemas from `protocol` (06). The `execution` field
  allows an inline manifest (base schema, not plugin-aware), `{ id }`, `{ path }`,
  `{ id, patch }`.
- **Tool descriptions** (normative content, wording may be tightened): what the tool does;
  that `retrieve` is how to discover capabilities and their `accepts`/`returns`; the fix loop
  (`execute` with `mode: "validate"`, read `issues`, fix, repeat); prefer `path` for local files;
  `output.path` for large results; secrets are never passed through these tools (use
  `ecp secrets set` and config objects).
- **Host discovery per call:** read `host.json`; `GET /v1/health`. Missing or failing → run
  `ecp host start` (spawn the CLI with the same `ECP_HOME`), wait up to 15 s. Still failing →
  tool error `ECP_HOST_UNAVAILABLE` with the log paths.
- **Paths:** relative `execution.path`, `output.path` and file paths in inputs resolved against
  the relay's `cwd` before forwarding.
- **Restarts:** connection refused or 503 `ECP_HOST_RESTARTING` → poll health every 250 ms up to
  30 s, then retry once. `execute` sends a `clientRequestId` (UUID); if the connection drops
  after sending, the relay looks the run up with `retrieve { type: "run", filter: { clientRequestId } }`
  after the host is back and returns that run (status `interrupted` → the result tells the
  model to call `execute { resume }`).
- **Results:** `content: [{ type: "text", text }]` where `text` is the formatted data (JSON
  pretty-printed, or the formatter's text), plus `structuredContent` = the `data` object.
  `ok: false` → `isError: true` with the error rendered as text: when `issues` includes
  `severity: "error"`, the first line is the top-level `code` and a count (`1 validation error` /
  `N validation errors`), then one line per issue as `path: code — message (suggestions)` without
  repeating the first issue in the summary line; with no issues, `code — message` and optional
  suggestions as today.
- The tool list never changes, so the relay never sends `tools/list_changed`.
