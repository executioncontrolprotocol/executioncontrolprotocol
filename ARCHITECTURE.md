# ECP Architecture

This file matches the shipped MVP packages. Full decisions and diagrams live in
[`REALIGNMENT-PLAN.md`](REALIGNMENT-PLAN.md). Exact contracts live in
[`realignment/spec/`](realignment/spec/README.md).

## Overview

- **Executions** are JSON manifests (`@executioncontrolprotocol.execution`, version `2.0`):
  capability steps with sequence, parallel, branch and loop. One `expr` field decides routing
  (`true` means go). Executions never contain secrets or host config.
- **ECP host:** one restartable process with the engine (executor, validation, registry), a
  service container, plugins loaded in-process on first call, and a localhost HTTP API with
  three operations: `retrieve`, `execute`, `commit`. The host validates every capability call
  against `accepts`/`returns`.
- **Services:** every key component is an interface with swappable implementations, registered
  with `environment.use(Impl, Interface.service)` and looked up by id: plugin loading, storage,
  secrets, expressions (QuickJS-WASM), formatters (JSON, TOON), endpoints, auth.
- **Plugins** provide capabilities only, with a per-plugin `ecp.manifest.json` the registry is
  built from. Authors use `@executioncontrolprotocol/plugin-sdk` (`definePlugin`, `capability`).
- **Host supervisor** keeps a host running and restarts it when plugins change. **MCP relay**
  exposes the three operations as MCP tools and forwards them to the host API. The **CLI** and
  the **App** are clients of the same API.
- **Config objects** hold plugin settings with `{ "$secret": "key" }` references; values live in
  the secrets provider (`ecp secrets set`).
- **CLI mode:** when no host is running, one-off commands boot an in-process host for that call
  (Phase 5 benchmark: warm host savings &lt; 300 ms median on echo). MCP and the App always need
  a running host.

## Package layout

```text
packages/
  protocol/      types, JSON schemas, service tokens, error catalogue
  engine/        executor, validation, operations, environment container
  quickjs/       ExpressionEngine (QuickJS-WASM)
  local/         LocalStorage, LocalSecrets, LocalPluginRegistration
  formatters/    JsonFormatter, ToonFormatter
  host/          createLocalHost, HTTP API, supervisor, main entry
  cli/           ecp commands (retrieve, execute, commit, host, mcp, app, plugins, secrets)
  mcp-relay/     stdio MCP server → host HTTP
  app/           React App + graph helpers (served by host at /app/)
  plugin-sdk/    definePlugin, capability, manifest build
plugins/
  plugin-test/   harness capabilities (echo, delay, bounded, …)
  plugin-anthropic/
  plugin-azure-blob-storage/
  plugin-adobe-firefly-services/
```

## Data on disk (`ECP_HOME`, default `~/.ecp`)

| Path | Contents |
| --- | --- |
| `host.json` | Port, token, PIDs for the running host |
| `plugins/` | oclif plugin data dir (link/install) |
| `store/executions/`, `store/configs/` | Committed objects |
| `runs/<runId>/` | `run.json`, `steps/`, `events.ndjson`, artifacts |
| `schema/execution.schema.json` | Editor schema from installed plugins |
| `logs/` | host and relay logs |

## Out of scope (MVP)

Policies, remote plugin hosts, caller auth beyond a local token, the browser environment,
per-capability CLI commands or MCP tools, and Fluent TypeScript authoring (post-MVP).
