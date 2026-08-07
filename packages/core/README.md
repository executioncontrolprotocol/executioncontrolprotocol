# @executioncontrolprotocol/core

Runtime-agnostic ECP core: fluent workflow API, environment builder, registry, in-memory executor, encode/decode/patch/invoke, and Fluent rendering.

**This package has no Node or browser I/O on its main entry.** Host-specific compile and file loading live on subpaths (see below).

## Main entry (`@executioncontrolprotocol/core`)

Use for:

- Building environments: `environment()`, `extension()`, `runtime()`, `policy()`
- Operational APIs on **`Ecp`** after `await env.init()`: `run`, `encode`, `decode`, `patch`, `validate`, `describe`, `search`, `invoke`, `terminate`
- Workflow authoring: `workflow()`, `step()`, `parallel()`, etc.
- Fluent output: `ecp.encode(manifest).as("fluent")` (no `@executioncontrolprotocol/format-fluent` extension)

Do **not** import Node built-ins from the main barrel. Bundlers (Vite, etc.) should resolve only `@executioncontrolprotocol/core` for browser apps.

## Host subpaths

| Subpath | Host | Purpose |
| ------- | ---- | ------- |
| `@executioncontrolprotocol/core/node` | Node | Re-exports `@executioncontrolprotocol/core/loaders` + `@executioncontrolprotocol/core/compile` |
| `@executioncontrolprotocol/core/compile` | Node | `compileWorkflowSource`, `compileHarnessArtifactSource` (intent/reply TS), temp-file module eval |
| `@executioncontrolprotocol/core/loaders` | Node | File I/O for CLI and Node apps |
| `@executioncontrolprotocol/core/browser` | Browser | Authoring subset: builders, validate, Fluent encode, **browser-safe** `compileWorkflowSource` (esbuild-wasm + `globalThis.__ecpWorkflowShim`) |

CLI and `@executioncontrolprotocol/node` import `@executioncontrolprotocol/core/compile` and `@executioncontrolprotocol/core/loaders` directly—not the main barrel.

## Environment vs Ecp

| `Environment` (builder) | `Ecp` (after `init()`) |
| ----------------------- | ---------------------- |
| `withRuntime`, `withExtensions`, `withPolicies` | `run`, `encode`, `decode`, `patch`, `validate`, `invoke` |
| `init()` | `describe`, `search`, `terminate` |

## Related packages

- **`@executioncontrolprotocol/node`** — Node runtime, process env, secrets, re-exports Node compile
- **`@executioncontrolprotocol/browser`** — Browser runtime, registry, session config (not the demo app)
- **`@executioncontrolprotocol/types`** — Protocol types and JSON Schema outputs

See [AGENTS.md](../../AGENTS.md) for monorepo commands and extension rules.
