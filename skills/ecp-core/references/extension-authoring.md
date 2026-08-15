# Extension authoring (ECP core)

First-party packages under `packages/extensions/` follow third-party rules. Full recipe: `.cursor/rules/extensions.mdc`.

## Requirements

1. `defineExtension(ns, name).withCapabilities([...]).build()`
2. **`catalogExtension(def)` at module load** (required for string bindings)
3. Optional idempotent `register*Extension(registry?)`
4. Prefer npm package name aligned with extension id when possible
5. Handlers via `capabilityFor(id, name).withInput/withOutput/withHandler`

## Dependencies

| May use | Must not use |
| ------- | ------------ |
| `@executioncontrolprotocol/types`, `core`, `zod`, focused libs | `node`, `browser`, `cli`, `mcp` |

## Test

Use fixtures + `environment()` from **core** — not host runtimes inside extension package tests.

Vendor integrations live in https://github.com/executioncontrolprotocol/extensions (install `ecp-extensions`). Do not enumerate vendor packages in core docs inventories.
