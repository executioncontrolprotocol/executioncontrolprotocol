# @executioncontrolprotocol/plugin-image-sharp

Local Sharp image processing for ECP (Execution Control Protocol). Install with:

```sh
ecp plugins install image-sharp
```

Capability ids (`inspect`, `resize`, `transform`, …) are unchanged. The plugin runs on Node hosts. The browser catalog is a hop stub (no native `sharp`).

`sharp` ships native binaries. This repo smokes them on Ubuntu CI only. Windows and macOS may need a matching prebuilt binary (`npm_config_platform` / `npm_config_arch`) if install fails under oclif's plugin npm.

## Binding

```ts
import imageSharpExtension from "@executioncontrolprotocol/plugin-image-sharp"
import { environment, extension, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"

export default environment(NODE_ENVIRONMENT_ID, "image-prep").with([
  extension(imageSharpExtension).with({
    limits: { allowRemoteUrls: false },
    defaults: { format: "webp", quality: 84, stripMetadata: true },
  }),
])
```

Or install the plugin and let the CLI host load it. Workflow files bind by id
(`extension("@executioncontrolprotocol/image-sharp")`) and never import this package.

See `examples/image-prep.ecp.ts`.

## Capabilities

| Id | Summary |
| --- | --- |
| `@executioncontrolprotocol/image-sharp.inspect` | Metadata, stats, and derived facts for one image. |
| `@executioncontrolprotocol/image-sharp.resize` | Resize with fit/position options. |
| `@executioncontrolprotocol/image-sharp.transform` | Run a Sharp pipeline. |
| `@executioncontrolprotocol/image-sharp.crop` | Extract a box. |
| `@executioncontrolprotocol/image-sharp.thumbnail` | Named thumbnail sizes. |
| `@executioncontrolprotocol/image-sharp.convert` | Format convert only. |
| `@executioncontrolprotocol/image-sharp.composite` | Overlay images. |
| `@executioncontrolprotocol/image-sharp.normalize` | Auto-orient and sRGB. |
| `@executioncontrolprotocol/image-sharp.derive` | Named pipeline variants. |
| `@executioncontrolprotocol/image-sharp.metadata` | Metadata-only inspect. |
| `@executioncontrolprotocol/image-sharp.stats` | Stats-only inspect. |

```sh
ecp image-sharp inspect --input fixtures/inspect-input.json --json
```

No `secrets("…")` keys.

## Config

| Field | Description |
| --- | --- |
| `limits` | Size, pixel, remote-URL, and variant caps. |
| `defaults` | Output format, quality, stripMetadata, failOn. |
| `artifacts` | Output prefix for written files (`artifacts/images` by default). |
| `concurrency` | Optional Sharp thread count. |

## Authoring

This package keeps `src/` and a minimal `package.json`. `ecp plugins build` generates the oclif files. Do not hand-write command classes.
