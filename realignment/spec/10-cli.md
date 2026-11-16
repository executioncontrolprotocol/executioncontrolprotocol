# 10 — CLI (`ecp`)

oclif (`@oclif/core` 5), bin `ecp`, package `@executioncontrolprotocol/cli`. Commands are plain
oclif command classes (no generation). Core oclif plugins bundled: `@oclif/plugin-plugins`,
`@oclif/plugin-help`, `@oclif/plugin-not-found`. The CLI sets the oclif data dir to
`$ECP_HOME/plugins` (`ECP_DATA_DIR`).

## Commands

| Command | Flags / args | Behaviour |
| --- | --- | --- |
| `ecp host start` | `--foreground` | Start the supervisor (detached) or, with `--foreground`, run supervisor + host attached (for debugging and tests). Prints URL, pid, log paths. Already running → prints status, exit 0 |
| `ecp host stop` | `--force` | Control `POST /stop`; waits for exit; removes `host.json` |
| `ecp host status` | `--json` | Supervisor `/status` + host `/v1/health`; exit 4 if not running |
| `ecp host restart` | `--force` | Control `POST /restart` |
| `ecp host logs` | `--lines <n>` (default 50), `--supervisor` | Tail the log file |
| `ecp mcp start` | — | Run the MCP relay on stdio (09). Never prints to stdout except MCP frames; logs go to `logs/relay.log` |
| `ecp app` | `[path]`, `--id <id>`, `--no-open` | Ensure a host; open `http://127.0.0.1:<port>/app/#token=<token>&open=<absolute path>` (or `&dir=<cwd>` with no path, or `&id=<id>`) in the default browser; hot reload is always on (11). `--no-open` prints the URL |
| `ecp retrieve` | `--type`, `--id`, `--query`, `--limit`, `--include a,b`, `--filter key=value` (repeatable), `--format <id>`, `--out <file>`, `--json` | Operation 06 |
| `ecp execute` | `[path \| id]`, `--input <json \| @file \| ->`, `--validate`, `--no-wait`, `--resume <runId>`, `--cancel <runId>`, `--out <file>`, `--start-host`, `--json` | Operation 06. Positional: ends in `.ecp.json` or contains a path separator → `path`, else `id` |
| `ecp commit` | `--type`, `--action`, `--id`, `--object <@file \| ->`, `--patch <@file \| ->`, `--if-version <n>`, `--json` | Operation 06 |
| `ecp plugins install \| uninstall \| link \| update \| list` | oclif's flags only | Manifest check and marker after changes (08). `list` adds manifest status per plugin |
| `ecp secrets set` | `<key>`, `--value <v>` or stdin or interactive hidden prompt | Writes to the local `SecretsProvider`; never echoes the value |
| `ecp secrets unset` | `<key>` | Delete; exit 2 if missing |
| `ecp secrets list` | `--json` | Keys only, with source (`keychain` / `env`) |
| `ecp schema` | `--print` | Prints the **root** `execution.schema.json` path (or contents with `--print`); ensures root **and** `schema/plugins/*` editor files are current (host start or in-process write). No new flags |

No other commands in the MVP. `ecp plugins discover`, `ecp migrate` and others are post-MVP.

## Host discovery for `retrieve` / `execute` / `commit` / `schema`

1. `host.json` exists and `GET /v1/health` is `ok` within 500 ms → call the HTTP API.
2. Else, with `--start-host` → `ecp host start`, then (1).
3. Else → in-process: `createLocalHost({ mode: "in-process" })` (same services, no HTTP
   endpoint), run the operation, stop the host, exit. Print to stderr once:
   `tip: run "ecp host start" to keep a warm host and make commands faster`.

Health `draining` → wait and retry like the relay (09), up to 30 s.

The background-host default (whether step 3 should auto-start a host) is decided by the CLI
benchmark in Phase 5 (12). The spec above is the starting behaviour.

## Input and paths

- Flags are only for top-level primitives. Structured values come from `--input`, `--object`,
  `--patch` as JSON text, `@file`, or `-` (stdin).
- Relative paths are resolved against the CLI's cwd and sent absolute.
- `--filter key=value` builds `filter` (only keys in 06).

## Output

- Default: human-readable. `retrieve` lists as an aligned table; items as indented JSON (or the
  formatter's text). `execute`: one line per step with its status (`completed`,
  `skipped`, `failed`), then the result as JSON, or the error with each issue as
  `path  CODE  message` and its suggestions. Validation results print the same issue lines.
- `--json`: the envelope (06) as one JSON document on stdout, nothing else on stdout.
- `--out <file>`: write the full data there; print a one-line summary.
- Exit codes: 06.
- No emojis or colour when stdout isn't a TTY; respect `NO_COLOR`.

## Hooks

- `init`: set `ECP_DATA_DIR` default; ensure `$ECP_HOME` exists.
- `command_not_found` (plugin-not-found): suggest the closest command.
- Plugin install/link/uninstall/update: manifest check and marker touch after.
