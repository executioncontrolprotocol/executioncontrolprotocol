# 10 — CLI (`ecp`)

oclif (`@oclif/core` 5), bin `ecp`, package `@executioncontrolprotocol/cli`. Commands are plain
oclif command classes (no generation). Core oclif plugins bundled: `@oclif/plugin-help`,
`@oclif/plugin-not-found`. `@oclif/plugin-plugins` is a **library dependency only** (install/link
mechanics); it is **not** listed in `oclif.plugins` and its command classes are not loaded. The
bin sets `ECP_DATA_DIR` (default
`$ECP_HOME/plugins`) **before** oclif `Config.load`, so install/link writes and reads share one
data dir. ECP packages are not loaded as oclif CLI plugins (`userPlugins: false`); `ecp plugins`
lists via host `retrieve --type plugin`.

## Commands

| Command | Flags / args | Behaviour |
| --- | --- | --- |
| `ecp host start` | `--foreground`, `--idle-minutes <n>`, `--started-by auto\|explicit` | Start the supervisor (detached) or, with `--foreground`, run supervisor + host attached (for debugging and tests). Prints URL, pid, idle policy (`0` = never), log paths. Already running → prints status, exit 0. Default idle **15 min** (`ECP_HOST_IDLE_MINUTES`); `0` never. Discovery and the relay pass `--started-by auto` |
| `ecp host stop` | `--force` | Control `POST /stop`; waits for exit; removes `host.json` and `supervisor.pid` |
| `ecp host status` | `--json` | Supervisor `/status` + host `/v1/health`; adds `startedBy`, `idleMinutes` (`0` → never), `lastActivityAt`, `idleShutdownAt` (or null), `idleBlockedBy` (`run` \| `stream` when held). Exit 4 if not running (does not auto-start) |
| `ecp host restart` | `--force` | Control `POST /restart` (drain, respawn host, re-read plugins and config). **`ecp host reload` is an oclif alias of `restart`, not a separate command** |
| `ecp host logs` | `--lines <n>` (default 50), `--supervisor` | Tail the log file |
| `ecp mcp start` | — | Run the MCP relay on stdio (09). Never prints to stdout except MCP frames; logs go to `logs/relay.log` |
| `ecp app` | `[path]`, `--id <id>`, `--no-open` | Ensure a host; open `http://127.0.0.1:<port>/app/#token=<token>&open=<absolute path>` (or `&dir=<cwd>` with no path, or `&id=<id>`) in the default browser; hot reload is always on (11). `--no-open` prints the URL |
| `ecp retrieve` | `--type`, `--id`, `--query`, `--limit`, `--include a,b`, `--filter key=value` (repeatable), `--format <id>`, `--out <file>`, `--no-start-host`, `--json` | Operation 06 |
| `ecp execute` | `[path \| id]`, `--input <json \| @file \| ->`, `--validate`, `--no-wait`, `--resume <runId>`, `--cancel <runId>`, `--out <file>`, `--no-start-host`, `--json` | Operation 06. Positional: ends in `.ecp.json` or contains a path separator → `path`, else `id` |
| `ecp commit` | `--type`, `--action`, `--id`, `--object <@file \| ->`, `--patch <@file \| ->`, `--if-version <n>`, `--no-start-host`, `--json` | Operation 06 |
| `ecp plugins` | `--json`, `--no-start-host` | Host plugin list: columns `package`, `version`, `source`, `manifest` (`ok` or first-issue summary). `--json` → `{ ok, data: { type: "plugin", items, total } }` |
| `ecp plugins install` (alias `plugins add`) | `<package>`, `--force`, `--verbose`, `--json` | Install from npm, friendly name (`test` → `@executioncontrolprotocol/plugin-test`), or tarball path (converted to `file:` URL). Already installed without `--force` → exit 0 `alreadyInstalled`. Manifest invalid → exit 2 `ECP_MANIFEST_INVALID` (package stays). Missing `"oclif": {}` → exit 2 with regenerate hint |
| `ecp plugins link` | `[path]` (default `.`), `--install` / `--no-install`, `--verbose`, `--json` | Link a local package; manifest check; touches marker before envelope |
| `ecp plugins uninstall` (aliases `plugins unlink`, `plugins remove`) | `<package>`, `--verbose`, `--json` | Required arg; missing plugin → exit 2 `ECP_NOT_FOUND` |
| `ecp plugins update` | `--verbose`, `--json` | User `type` entries only; no user plugins → exit 0, no npm |
| `ecp plugins reset` | `--hard`, `--reinstall`, `--verbose`, `--json` | Same effects as oclif reset (no checkmark emoji in human output); envelope `{ action: "reset", removed, hard, reinstall }` |
| `ecp plugins inspect` | `PLUGIN…`, `--verbose`, `--json` | Installation properties for a linked/user plugin (resolved from `$ECP_DATA_DIR`, not oclif's loaded plugin list) |
| `ecp secrets set` | `<key>`, `--value <v>` or stdin or interactive hidden prompt | Writes to the local `SecretsProvider`; never echoes the value |
| `ecp secrets unset` | `<key>` | Delete; exit 2 if missing |
| `ecp secrets list` | `--json` | Keys only, with source (`keychain` / `env`) |
| `ecp schema` | `--print` | Prints the **root** `execution.schema.json` path (or contents with `--print`); ensures root **and** `schema/plugins/*` editor files are current (in-process write, or the running host if already healthy). No `--start-host` / auto-start |

No other commands in the MVP. `ecp plugins discover`, `ecp migrate` and others are post-MVP.

## Host discovery for `retrieve` / `execute` / `commit` / `plugins` (list)

1. `host.json` exists and `GET /v1/health` is `ok` within 500 ms → call the HTTP API.
2. Else, unless `--no-start-host` or `ECP_NO_START_HOST=1`/`true` → start a detached
   supervisor (same path as `ecp host start --started-by auto`), wait up to 15 s for (1).
   On success, print to stderr once (only when this command spawned the supervisor):
   `host: started http://127.0.0.1:<port> (idle 15m)` (or the configured idle; `0` →
   `idle never`). Reuse prints nothing. Start failure → exit **4** `ECP_HOST_UNAVAILABLE`
   with host and supervisor log paths (no in-process fallback).
3. Else → in-process: `createLocalHost({ mode: "in-process" })` (same services, no HTTP
   endpoint), run the operation, stop the host, exit. Print to stderr once a tip naming why
   (`ECP_NO_START_HOST` is set, or `--no-start-host`) and how to get the warm host. Commands that
   never auto-start (`schema`) print no tip.

If the warm host refuses the request because it began draining (for example an idle shutdown
starting between discovery and the request: `ECP_HOST_RESTARTING`, or the connection drops),
the CLI rediscovers once (waiting out the drain and auto-starting a fresh host when allowed)
and resends the same request. It retries at most once.

Health `draining` → wait and retry like the relay (09), up to 30 s.

**Never auto-start:** `ecp host status|stop|restart|logs|reload` (status when down stays exit
4); `ecp secrets *`; `ecp plugins install|uninstall|link|update|reset|inspect`; `ecp schema`
(always in-process write unless a healthy host already exists). `ecp host start`, `ecp mcp
start`, and `ecp app` ignore `ECP_NO_START_HOST`.

**Opt-out:** per-command `--no-start-host` on retrieve, execute, commit, and plugins list;
global `ECP_NO_START_HOST`. A healthy host is still reused. Bench B1–B3 in-process rows set
the env var so timings stay comparable (spec 12).

## Input and paths

- Flags are only for top-level primitives. Structured values come from `--input`, `--object`,
  `--patch` as JSON text, `@file`, or `-` (stdin).
- Relative paths are resolved against the CLI's cwd and sent absolute.
- `--filter key=value` builds `filter` (only keys in 06).

## Output

- Default: human-readable. `retrieve` lists as an aligned table with a header row: capability
  `id`, `plugin`, `summary`; execution `id`, `version`, `updatedAt`; config `id`, `plugin`; run
  `id`, `status`, `startedAt`; plugin `package`, `version`, `source`, `manifest` (`ok` or first
  issue); formatter `id`, `mediaType`, `default`. Single-item `--id` responses stay indented JSON;
  formatter text output is unchanged. `execute`: one line per step with its status (`completed`,
  `skipped`, `failed`), then the result as JSON, or the error with a count line
  (`CODE  N validation error(s)`) then each issue as `path  CODE  message` and its suggestions.
- `--json`: the envelope (06) as one JSON document on stdout, nothing else on stdout, on every
  ECP-owned command (`host`, `mcp` except `mcp start`, `app`, `schema`, `secrets`, all `plugins`
  subcommands including `install`, `link`, `uninstall`, `update`, `reset`, and the three
  operations). Exceptions: `ecp mcp start` has no `--json` (stdio is the MCP stream).
  `schema --print --json` returns `{ ok: true, data: { path, schema } }` with the parsed schema
  document in `data.schema` (human `--print` still writes the raw file). Plugin install/link
  success: `{ action, package, version, type, root, alreadyInstalled?, manifest: { ok } | { ok:
  false, issues } }`; uninstall `{ action, package, removed }`; update `{ action, updated }`;
  reset `{ action, removed, hard, reinstall }`.
- `--out <file>`: write the full data there; print a one-line summary.
- Exit codes: 06.
- No emojis or colour when stdout isn't a TTY; respect `NO_COLOR`.

## Hooks

- Bin (before `Config.load`): set `ECP_HOME` / `ECP_DATA_DIR` defaults and create the dirs;
  pass `loadOptions: { userPlugins: false }` so linked ECP packages are not loaded as oclif
  CLI plugins.
- `init`: ensure home layout (idempotent); one-time stderr notice when the OS default oclif
  data dir still has plugin entries and `$ECP_HOME/plugins` does not (stamp
  `$ECP_HOME/.ecp-noticed-legacy-plugins`).
- `command_not_found` (plugin-not-found): suggest the closest command.
- Plugin install/link/uninstall/update: manifest check and marker touch after.
