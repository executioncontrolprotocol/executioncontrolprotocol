# @executioncontrolprotocol/image-sharp

Node-native Sharp image processing for ECP workflows.

## Runtime

Requires `@executioncontrolprotocol/node`. Declares `.withSupportedRuntimes(["@executioncontrolprotocol/node"])`. Capabilities execute as **host**: the browser catalog hops to `ecp up`.

Native `sharp` is **not** on the web graph. The package uses standard `exports` conditions (`browser` → catalog, `node`/`import` → Sharp). Apps import the package root:

```ts
import "@executioncontrolprotocol/image-sharp"
```

```json
".": {
  "types": "./dist/index.d.ts",
  "browser": "./dist/index.browser.js",
  "node": "./dist/index.js",
  "import": "./dist/index.js"
}
```

Vite/webpack pick `browser` automatically. Do not import `index.browser` by path.

## Media I/O

Image bytes are resolved and written through core (`resolveFile` / `writeMediaArtifact`). This package only runs Sharp ops. Prefer `FileRef` kinds (`buffer`, `file`, `url`, `artifact`); browser uploads use `ecp://browser/…` on `file.path`. Input schemas use `fileRefSchema({ contentMediaType: "image/*" })` so UIs can filter file pickers; MIME is enforced after `resolveFile`.

## Binding

```ts
import "@executioncontrolprotocol/image-sharp"
import { environment, extension } from "@executioncontrolprotocol/node"

export default environment("image-demo").withExtensions([
  extension("@executioncontrolprotocol/image-sharp").with({}),
])
```

## Capabilities

| Capability | Purpose |
| ---------- | ------- |
| `inspect` | Metadata, optional stats, derived facts |
| `metadata` / `stats` | Thin inspection subsets |
| `transform` | Declarative pipeline of Sharp operations |
| `resize`, `crop`, `thumbnail`, `convert`, `composite`, `normalize` | Convenience wrappers |
| `derive` | Multiple named variants from one source |

## Image references

Uses shared `FileRef` from `@executioncontrolprotocol/types` (`artifact`, `file`, `url`, `buffer`).
