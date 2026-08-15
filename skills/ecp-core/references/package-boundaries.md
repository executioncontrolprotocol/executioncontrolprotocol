# Package boundaries (ECP core)

**Core is runtime-agnostic.** The main `@executioncontrolprotocol/core` barrel has no Node or browser I/O.

| Subpath | Host |
| ------- | ---- |
| `@executioncontrolprotocol/core/node` | Node convenience (loaders + compile) |
| `@executioncontrolprotocol/core/compile` | Node esbuild compile |
| `@executioncontrolprotocol/core/loaders` | Node file I/O (CLI) |
| `@executioncontrolprotocol/core/browser` | Browser authoring + esbuild-wasm |

**Compile stays on core subpaths**, not on runtime hosts. Extensions and harnesses depend on `types` + `core` only — never on `node`, `browser`, `cli`, or `mcp`.

| Layer | Owns |
| ----- | ---- |
| `core/compile` + `core/browser` | Compile APIs |
| `@executioncontrolprotocol/browser` | Executor, registry, session — not harnesses |
| Browser demo app | Binds harnesses + providers + UI |

Operational APIs live on **`Ecp` after `init()`**: `run`, `encode`, `decode`, `patch`, `validate`, `describe`, `search`, `invoke`, `test`, `terminate`.

Fluent encode is in core — there is no `@executioncontrolprotocol/format-fluent` extension.

See root `AGENTS.md` for the full package map.
