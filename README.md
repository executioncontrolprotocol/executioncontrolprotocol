# Execution Control Protocol (ECP)

[![CI](https://github.com/executioncontrolprotocol/executioncontrolprotocol/actions/workflows/ci.yml/badge.svg)](https://github.com/executioncontrolprotocol/executioncontrolprotocol/actions/workflows/ci.yml)

ECP (Execution Control Protocol) is the **deterministic delegation** layer an orchestrating
agent operates: write a JSON execution, run it through a local host, read structured errors and
a run record, then repair and rerun.

MCP standardizes how models call tools. ECP standardizes how an agent **delegates** a graph of
those tools — under plugins, with a journal you can inspect.

**Docs:** [https://executioncontrolprotocol.io/](https://executioncontrolprotocol.io/)  
**MVP contracts:** [`realignment/spec/`](realignment/spec/README.md)  
**Architecture:** [`ARCHITECTURE.md`](ARCHITECTURE.md)

## Quick start (MVP)

```bash
# From a built checkout (see SETUP.md), or once packages are published:
ecp host start
ecp plugins link plugins/plugin-test   # or: ecp plugins install @executioncontrolprotocol/plugin-test

# Write an execution (JSON), then run it:
ecp execute path/to/echo.ecp.json --json

# Agents: MCP relay (exactly three tools: retrieve, execute, commit)
ecp mcp start

# Visual App (graph, validation, runs)
ecp app path/to/echo.ecp.json
```

Executions are `*.ecp.json` with `schema: "@executioncontrolprotocol.execution"` and
`version: "2.0"`. They never contain secrets. Config objects hold `{ "$secret": "key" }`
references; set values with `ecp secrets set`.

```bash
ecp retrieve --type capability --query echo --json
ecp execute fixtures/manifests/runs/echo.ecp.json --json
ecp commit --type execution --action create --object @my.ecp.json --json
```

`--json` prints `{ ok: true, data }` or
`{ ok: false, error: { code, message, path, suggestions } }`.

## Work in this repo

**Prerequisites:** Node.js 22+, pnpm 10 (`corepack enable`). Install from the **repo root** only.

```bash
git clone https://github.com/executioncontrolprotocol/executioncontrolprotocol.git
cd executioncontrolprotocol
corepack enable
pnpm install
pnpm run build
pnpm run check
```

See [`SETUP.md`](SETUP.md) for linking the CLI and plugins. Contributor skill:

```bash
npx skills add executioncontrolprotocol/executioncontrolprotocol --skill ecp-core -y
```

## Repository map

| Path | Role |
| --- | --- |
| `packages/protocol` | Shared types, schemas, service tokens |
| `packages/engine` | Executor, validation, operations, service container |
| `packages/quickjs` | QuickJS-WASM expression engine |
| `packages/local` | Disk storage, OS secrets, in-process plugin registration |
| `packages/host` | Local host process + HTTP API + supervisor |
| `packages/cli` | `ecp` CLI (oclif) |
| `packages/mcp-relay` | Stdio MCP relay (three tools) |
| `packages/app` | Visual App served at `/app/` |
| `packages/plugin-sdk` | `definePlugin` / `capability` authoring |
| `packages/formatters` | JSON and TOON formatters |
| `plugins/*` | First-party capability plugins |
| `fixtures/` | Conformance and acceptance fixtures |
| `test/e2e/` | CLI / MCP / acceptance e2e |
| `realignment/spec/` | MVP build spec (source of truth) |

## Related

- [`AGENTS.md`](AGENTS.md) — agent instructions and commands
- [`REALIGNMENT-PLAN.md`](REALIGNMENT-PLAN.md) — decisions and rationale
- [`RELEASING.md`](RELEASING.md) — publish checklist
