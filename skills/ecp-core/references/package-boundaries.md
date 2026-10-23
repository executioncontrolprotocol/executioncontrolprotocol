# Package boundaries (ECP core)

## Now (after Phase 2 PR 1, before environments)

Protocol types live at `@executioncontrolprotocol/core/types`. `registry-control` lives in core.
`packages/types` is gone.

**Core is host-agnostic at its root.** The main `@executioncontrolprotocol/core` entry has no
Node or browser I/O. Host code sits on subpaths:

| Subpath | Host |
| --- | --- |
| `@executioncontrolprotocol/core/node` | Node convenience (loaders + compile) |
| `@executioncontrolprotocol/core/compile` | Node esbuild compile |
| `@executioncontrolprotocol/core/loaders` | Node file I/O (CLI) |
| `@executioncontrolprotocol/core/browser` | Browser compile (esbuild-wasm) |

Extensions depend on `core` and `core/types` only, never on `node`, `browser`, `cli` or `mcp`.

## After the reset (Phase 2 onward)

| Package | Owns |
| --- | --- |
| `@executioncontrolprotocol/core` | The engine: Fluent API, registry, validation, executor, policy engine, `registry-control`, encoding, patch, journal model. Entries `.` and `./types` only |
| `@executioncontrolprotocol/node` | The Node environment: executor, workflow file loader, journal on disk, file and media I/O, OS keychain and env-var secrets providers |
| `@executioncontrolprotocol/browser` | The browser environment: executor, browser file and blob helpers |
| `@executioncontrolprotocol/cli` | The `ecp` host: plugin management, hooks, operations |
| `@executioncontrolprotocol/plugin-sdk` | `toCommands`, `EcpCommand`, `defineOperation`, plugin build library |
| `@executioncontrolprotocol/mcp` | MCP server and `ecp mcp serve` |
| `@executioncontrolprotocol/app`, `plugin-app` | Visual co-editor and its CLI plugin |
| `plugin-*` | Capability sets. Depend on `core` (peer) and `plugin-sdk` only |

Operational APIs live on **`Ecp` after `init()`**: `run`, `validate`, `describe`, `search`,
`invoke`, `encode`, `decode`, `patch`, `terminate`. Phase 4 adds stepping, resume and rerun on
the run journal, replacing `test`.

Fluent encode is in core; there's no `format-fluent` extension.

See `RESET-PLAN.md` §4.1 and §4.4, and root `AGENTS.md`.
