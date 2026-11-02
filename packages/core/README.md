# @executioncontrolprotocol/core

Host-agnostic ECP core: fluent workflow API, environment builder, registry, in-memory executor, encode/decode/patch/invoke, Fluent rendering, and protocol types.

**This package has no Node or browser I/O.** Host compile and file loading live on `@executioncontrolprotocol/node` and `@executioncontrolprotocol/browser`. Exports are `.` and `./types` only.

## Main entry (`@executioncontrolprotocol/core`)

Use for:

- Building environments: `environment()`, `extension()`, `policy()`, `defineEnvironment()`
- Operational APIs on **`Ecp`** after `await env.init()`: `run`, `encode`, `decode`, `patch`, `validate`, `describe`, `search`, `invoke`, `terminate`
- Workflow authoring: `workflow()`, `step()`, `.with([...])`, `.accepts()` / `.returns()`, `parallel()`, etc.
- Run options: `stopAfterStepId`, `onlyStepId`, `seedState`, `seedHistory`, `approvals`, `journal`, `onEvent`. Status includes `stopped` (inclusive `--to`) and `paused` (policy). There is no `ecp.test()`.
- Fluent output: `ecp.encode(manifest).as("fluent")`

Protocol types and schema constants live on **`@executioncontrolprotocol/core/types`** (for example `WorkflowManifest`, `LATEST_ECP_VERSION`, `FileRef`). The main barrel does not re-export them.

```ts
import { environment, extension, policy } from "@executioncontrolprotocol/core"
import { NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import { openaiExtension } from "@executioncontrolprotocol/plugin-openai"

const ecp = await environment(NODE_ENVIRONMENT_ID, "weekly-brief")
  .with([extension(openaiExtension).with({ defaultModel: "gpt-4o-mini" })])
  .init()
```

Do **not** import Node built-ins from this package. Bundlers (Vite, etc.) should resolve only `@executioncontrolprotocol/core` for browser apps.

### Media resolve/write (extensions)

Portable `ImageRef` values (`buffer` | `file` | `url` | `artifact`) are resolved by core — not by each vendor package:

```ts
import { resolveFile, writeMediaArtifact } from "@executioncontrolprotocol/core"

const { bytes, mediaType } = await resolveFile(input.image, ctx)
return { image: await writeMediaArtifact(outBytes, { mediaType, prefix: "artifacts/images" }, ctx) }
```

`file.path` may be a Node path (the Node environment binds a disk `MediaStore` with `.use()`) or an `ecp://browser/<id>` locator (`ctx.blobs`). The browser store keeps refs and uploads to a paired Node host.

## Environment vs Ecp

| `Environment` (builder) | `Ecp` (after `init()`) |
| ----------------------- | ---------------------- |
| `.with([...])`, `.use(provider)`, `init({ blobStore, artifactStore, remoteInvoke })` | `run`, `encode`, `decode`, `patch`, `validate`, `invoke` |
| | `describe`, `search`, `terminate` |

## Related packages

- **`@executioncontrolprotocol/core/types`** — Protocol types and JSON Schema outputs (`dist/schemas/`)
- **`@executioncontrolprotocol/node`** — Node environment: compile, loaders, OS secrets, process-env
- **`@executioncontrolprotocol/browser`** — Browser environment: registry, local config, esbuild-wasm compile

See [AGENTS.md](../../AGENTS.md) for monorepo commands and extension rules.
