# Vendor extensions

Third-party dogfood packages. They depend on `@executioncontrolprotocol/core` and `@executioncontrolprotocol/core/types` through public entry points only (`workspace:^` in this monorepo; published peers for external authors).

`jsonata` moved to [`plugins/plugin-jsonata`](../../plugins/plugin-jsonata) in Phase 3. `fal`, `image-sharp` and `azure-blob-storage` moved to `plugins/plugin-*` in Phase 5 PR 3.

This table is the remaining vendor inventory until PR 4.

## Packages

| Package | Extension id |
| ------- | ------------ |
| `@executioncontrolprotocol/adobe-firefly-services` | `@executioncontrolprotocol/adobe-firefly-services` |

External install DX is checked by `pnpm run test:vendor-pack` (packs core and `plugin-jsonata`, then typechecks imports against the tarballs).

Firefly examples remain under [`examples/vendor`](../../examples/vendor). Fal, image-prep and blob-only Azure examples live next to their plugins.
