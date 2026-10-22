# Image prep (image-sharp)

Sharp steps are **host** capabilities: they run on Node via `@executioncontrolprotocol/node`, not in the browser bundle.

## Prerequisites

From the monorepo root, install and build (workspace packages, including image-sharp):

```sh
pnpm install
pnpm run build
```

Then from this directory:

```sh
pnpm install
ecp validate workflow.ts --env environment.ts
ecp run workflow.ts --env environment.ts
```

`@executioncontrolprotocol/node` comes from this monorepo via the workspace install. For a global CLI, `pnpm link --global` from `packages/cli` after `pnpm run build`.

## CLI smoke test

From `examples/vendor/04-image-prep` (after setup above):

```sh
ecp validate workflow.ts --env environment.ts
ecp run workflow.ts --env environment.ts
```

Expect `imageInfo` metadata and a `thumb` WebP artifact in the run output.

### Optional: invoke one step

```sh
ecp invoke @executioncontrolprotocol/image-sharp.inspect \
  --env environment.ts \
  --input '{"image":{"kind":"buffer","data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==","mediaType":"image/png"},"include":["metadata"]}'
```

## Capabilities used

| Step | Id | Execution |
| ---- | -- | --------- |
| Inspect | `@executioncontrolprotocol/image-sharp.inspect` | host |
| Resize | `@executioncontrolprotocol/image-sharp.resize` | host |

See [`packages/vendor/image-sharp/README.md`](../../../packages/vendor/image-sharp/README.md) for the full capability list.
