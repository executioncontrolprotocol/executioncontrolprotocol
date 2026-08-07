# @executioncontrolprotocol/extension-image-sharp

Node-native Sharp image processing for ECP workflows.

## Runtime

Requires `@executioncontrolprotocol/node`. Declares `.withSupportedRuntimes(["@executioncontrolprotocol/node"])`.

## Capabilities

| Capability | Purpose |
| ---------- | ------- |
| `inspect` | Metadata, optional stats, derived facts |
| `metadata` / `stats` | Thin inspection subsets |
| `transform` | Declarative pipeline of Sharp operations |
| `resize`, `crop`, `thumbnail`, `convert`, `composite`, `normalize` | Convenience wrappers |
| `derive` | Multiple named variants from one source |

## Image references

Uses shared `ImageRef` from `@executioncontrolprotocol/types` (`artifact`, `file`, `url`, `buffer`).

Bind with `@executioncontrolprotocol/image-policy` for cross-extension image governance.

See `examples/04-image-prep/`.
