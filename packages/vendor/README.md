# Vendor extensions

Third-party dogfood packages. They depend on `@executioncontrolprotocol/core` and `@executioncontrolprotocol/core/types` through public entry points only (`workspace:^` in this monorepo; published peers for external authors).

Protocol/platform extensions stay in [`packages/extensions`](../extensions). `jsonata` moved to [`plugins/plugin-jsonata`](../../plugins/plugin-jsonata) in Phase 3.

This table is the vendor inventory.

## Packages

| Package | Extension id |
| ------- | ------------ |
| `@executioncontrolprotocol/fal` | `@executioncontrolprotocol/fal` |
| `@executioncontrolprotocol/image-sharp` | `@executioncontrolprotocol/image-sharp` |
| `@executioncontrolprotocol/adobe-firefly-services` | `@executioncontrolprotocol/adobe-firefly-services` |
| `@executioncontrolprotocol/azure-blob-storage` | `@executioncontrolprotocol/azure-blob-storage` |

External install DX is checked by `pnpm run test:vendor-pack` (packs core and `plugin-jsonata`, then typechecks imports against the tarballs).

Examples live under [`examples/vendor`](../../examples/vendor).
