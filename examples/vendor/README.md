# Vendor extension examples

Remaining Adobe Firefly examples. Fal, image-prep and blob-only Azure upload moved next to their plugins in Phase 5 PR 3.

Requires a core monorepo checkout plus the listed packages.

| Folder | Teaches |
| ------ | ------- |
| [adobe-firefly-smoke](./adobe-firefly-smoke) | Adobe Firefly auth smoke |
| [azure-adobe-assets](./azure-adobe-assets) | Azure Blob upload + Firefly (waits on `plugin-adobe-firefly-services` in PR 4) |
| [azure-photoshop-manifest](./azure-photoshop-manifest) | Azure Blob + Photoshop `photoshop-generate-manifest` (waits on PR 4) |

Plugin examples:

- [`plugins/plugin-fal/examples/fal-chain.ecp.ts`](../../plugins/plugin-fal/examples/fal-chain.ecp.ts)
- [`plugins/plugin-image-sharp/examples/image-prep.ecp.ts`](../../plugins/plugin-image-sharp/examples/image-prep.ecp.ts)
- [`plugins/plugin-azure-blob-storage/examples/upload.ecp.ts`](../../plugins/plugin-azure-blob-storage/examples/upload.ecp.ts)

Core protocol / CLI examples: https://github.com/executioncontrolprotocol/executioncontrolprotocol/tree/main/examples

Prefer catalog import + `extension(id).with({…})` (and `secrets("…")` for keys) as the consumer-facing bind pattern.
