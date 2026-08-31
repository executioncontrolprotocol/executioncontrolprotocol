# @executioncontrolprotocol/core

Runtime-agnostic ECP core: fluent workflow API, environment builder, registry, in-memory executor, encode/decode/patch/invoke, and Fluent rendering.

**This package has no Node or browser I/O on its main entry.** Host-specific compile and file loading live on subpaths (see below).

## Main entry (`@executioncontrolprotocol/core`)

Use for:

- Building environments: `environment()`, `extension()`, `runtime()`, `policy()`
- Operational APIs on **`Ecp`** after `await env.init()`: `run`, `encode`, `decode`, `patch`, `validate`, `describe`, `search`, `invoke`, `terminate`
- Workflow authoring: `workflow()`, `step()`, `.accepts()` / `.returns()`, `parallel()`, etc.
- Fluent output: `ecp.encode(manifest).as("fluent")` (no `@executioncontrolprotocol/format-fluent` extension)

Do **not** import Node built-ins from the main barrel. Bundlers (Vite, etc.) should resolve only `@executioncontrolprotocol/core` for browser apps.

### Media resolve/write (extensions)

Portable `ImageRef` values (`buffer` | `file` | `url` | `artifact`) are resolved by core — not by each vendor package:

```ts
import { resolveFile, writeMediaArtifact } from "@executioncontrolprotocol/core"

const { bytes, mediaType } = await resolveFile(input.image, ctx)
// …domain processing…
return { image: await writeMediaArtifact(outBytes, { mediaType, prefix: "artifacts/images" }, ctx) }
```

`file.path` may be a Node path or an `ecp://browser/<id>` locator (`ctx.blobs`). Host hops already walk nested payloads (including ImageRef trees) via `collectBrowserLocators`.

```ts
import { workflow, step, ref } from "@executioncontrolprotocol/core"

const manifest = workflow("Weekly brief")
  .accepts({ type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] })
  .returns({ type: "object", properties: { echo: { type: "object" } } })
  .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: ref("prompt") }).as("echo")])
  .toManifest()
```

## Host subpaths

| Subpath | Host | Purpose |
| ------- | ---- | ------- |
| `@executioncontrolprotocol/core/node` | Node | Re-exports `@executioncontrolprotocol/core/loaders` + `@executioncontrolprotocol/core/compile` |
| `@executioncontrolprotocol/core/compile` | Node | `compileWorkflowSource`, `compileHarnessArtifactSource` (intent/reply TS), temp-file module eval |
| `@executioncontrolprotocol/core/loaders` | Node | File I/O for CLI and Node apps |
| `@executioncontrolprotocol/core/browser` | Browser | Authoring subset: builders, validate, Fluent encode, **browser-safe** `compileWorkflowSource` + `compileHarnessArtifactSource` (esbuild-wasm + blob `import`) |

CLI and `@executioncontrolprotocol/node` import `@executioncontrolprotocol/core/compile` and `@executioncontrolprotocol/core/loaders` directly—not the main barrel.

**Why compile is here (not on runtime hosts):** harnesses must compile Fluent/TS artifacts without importing `@executioncontrolprotocol/node` or `@executioncontrolprotocol/browser`. Same APIs; Node vs browser entry (or `"browser"` condition on `./compile`). Hosts may re-export for convenience.

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
