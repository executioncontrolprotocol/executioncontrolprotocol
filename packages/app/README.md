# `@executioncontrolprotocol/app`

Visual App for ECP (Execution Control Protocol): a `HostAdapter` UI, the React Flow
graph encoder, and a prebuilt static bundle (`dist/web`). The App is a viewer and
co-editor of workflow files. It stores no secrets and makes no model calls.

Open it with the JIT CLI plugin:

```sh
ecp plugins link plugins/plugin-app
ecp app product.ecp.ts
```

Until `0.50.0` is on the registry, do not expect first-use JIT from npm. There is no
hosted browser demo and no `ecp up`. CLI `oclif.jitPlugins` pins `"^0.50"`.

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
