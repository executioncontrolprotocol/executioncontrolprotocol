# `@executioncontrolprotocol/app`

Visual App for ECP (Execution Control Protocol): a `HostAdapter` UI, the React Flow
graph encoder, and a prebuilt static bundle (`dist/web`). The App is a viewer and
co-editor of workflow files. It stores no secrets and makes no model calls.

Open it with the JIT CLI plugin:

```sh
ecp plugins link plugins/plugin-app
ecp app product.ecp.ts
ecp app product.ecp.ts --env environment.ecp.ts
```

The left pane tabs **Workflow** (editable Fluent) and **Environment** (read-only).
Environment shows `--env` / `~/.ecp/config/environment.ecp.ts` when that file exists,
otherwise a synthesized process-host view. The footer pill reports whether the
workflow is valid.

Until `0.51.0` is on the registry, do not expect first-use JIT from npm. There is no
hosted browser demo and no `ecp up`. CLI `oclif.jitPlugins` pins `"^0.51"`.

## Development

`ecp app` serves the production `dist/web` bundle. For HMR, proxy Vite at the
plugin-app origin (default `http://127.0.0.1:8787`):

```sh
# terminal 1
ecp app examples/01-echo/workflow.ecp.ts --no-open --port 8787
# terminal 2
pnpm --filter @executioncontrolprotocol/app dev
# open http://127.0.0.1:5173/?token=<from terminal 1>
```

Override the proxy target with `ECP_APP_ORIGIN`. `pnpm --filter @executioncontrolprotocol/app preview`
serves the built bundle the same way.

## Library

```ts
import {
  canRoundTrip,
  createLocalHostAdapter,
  workflowToReactFlow,
} from "@executioncontrolprotocol/app"

const adapter = createLocalHostAdapter({ baseUrl, token })
const loaded = await adapter.load()
const graph = workflowToReactFlow(loaded.manifest)
```

Graph edits that cannot round-trip (relative imports, computed `.with()` values) open
read-only. Encoder-written Fluent files stay editable.

React is an optional peer, needed only when you import the UI components. `plugin-app`
serves `dist/web` and does not need React at run time.
