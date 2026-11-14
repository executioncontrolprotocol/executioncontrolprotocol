# ECP Architecture

**Status:** the realignment milestone (`milestone/realignment`) is replacing the architecture
the current packages implement. The target architecture, with diagrams, is in
[`REALIGNMENT-PLAN.md`](REALIGNMENT-PLAN.md). This file is the short version.

## Target

- **Executions** (formerly workflows) are JSON manifests (`@executioncontrolprotocol.execution`,
  version `2.0`): capability steps with sequence, parallel, branch and loop. One `expr` field
  decides routing (`true` means go). Executions never contain secrets or host config.
- **ECP host:** one restartable process with the engine (executor, validation, registry), a
  service container, plugins loaded in-process on first call, and a localhost HTTP API with
  three operations: `retrieve`, `execute`, `commit`. The host validates every capability call
  against `accepts`/`returns`.
- **Services:** every key component is an interface with swappable implementations,
  registered with `environment.use(Impl, Interface.service)` and looked up by id: plugin
  loading, storage, secrets, expressions (QuickJS-WASM), formatters (JSON, TOON), endpoints,
  auth.
- **Plugins** provide capabilities only, with a per-plugin `ecp.manifest.json` the registry is
  built from.
- **Host supervisor** keeps a host running and restarts it when plugins change. **MCP relay**
  exposes the three operations as MCP tools and forwards them to the host API. The **CLI** and
  the **App** are clients of the same API.
- **Config objects** hold plugin settings with `{ "$secret": "key" }` references; values live in
  the secrets provider.
- Out of scope for now: policies, remote plugin hosts, caller auth beyond a local token, the
  browser environment.

## Current code

The packages in `packages/` and `plugins/` implement the previous design (workflow manifests
v1.0, Fluent TS workflow files, environments with extension and policy bindings, per-capability
CLI commands and MCP tools). They are legacy reference code during the milestone. See
`AGENTS.md` for what each becomes.
