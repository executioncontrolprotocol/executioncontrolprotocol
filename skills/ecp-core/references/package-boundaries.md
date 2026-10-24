# Package boundaries (ECP core)

## After Phase 2

Protocol types live at `@executioncontrolprotocol/core/types`. `registry-control` lives in core.
`packages/types` is gone. Hosts live in `packages/environments/{node,browser}`.

**Core is host-agnostic.** Exports are `.` and `./types` only. ESLint bans `node:*`, `fs`,
`path`, and `child_process` under `packages/core/src/**`.

| Package | Owns |
| --- | --- |
| `@executioncontrolprotocol/core` | The engine: Fluent API, registry, validation, executor, policy engine, `registry-control`, encoding, patch, journal model |
| `@executioncontrolprotocol/node` | The Node environment: executor, workflow file loader, compile, file and media I/O, OS keychain and env-var secrets providers |
| `@executioncontrolprotocol/browser` | The browser environment: executor, browser compile (esbuild-wasm), file and blob helpers |
| `@executioncontrolprotocol/cli` | The `ecp` host: plugin management, hooks, operations |
| `@executioncontrolprotocol/plugin-sdk` | `toCommands`, `EcpCommand`, `defineOperation`, plugin build library (Phase 3) |
| `@executioncontrolprotocol/mcp` | MCP server and `ecp mcp serve` |
| `@executioncontrolprotocol/app`, `plugin-app` | Visual co-editor and its CLI plugin (Phase 8 Done). `plugin-app` may import `node` and `app`; it must not import `cli` or `mcp` |
| `plugin-*` | Capability sets. Depend on `core` (peer) and `plugin-sdk`. All 13 first-party plugins live under `plugins/` after Phase 5 |

Extensions depend on `core` and `core/types` only, never on `node`, `browser`, `cli` or `mcp`.
Bind `extension(definition)` on `environment(id, label?).with([...])`.

Operational APIs live on **`Ecp` after `init()`**: `run`, `validate`, `describe`, `search`,
`invoke`, `encode`, `decode`, `patch`, `terminate`. Phase 4 adds stepping, resume and rerun on
the run journal, replacing `test`.

Fluent encode is in core; there's no `format-fluent` extension.

See `RESET-PLAN.md` §4.1 and §4.4, and root `AGENTS.md`.
