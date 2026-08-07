# @executioncontrolprotocol/node

**Node.js runtime host** for ECP: Node executor, process-env and secrets extensions, and re-exports of Node-only compile from `@executioncontrolprotocol/core`.

## vs `@executioncontrolprotocol/core`

| Package | Role |
| ------- | ---- |
| `@executioncontrolprotocol/core` | Runtime-agnostic API and in-memory engine |
| `@executioncontrolprotocol/node` | Node host: `@executioncontrolprotocol/node` runtime, `process.env`, secrets, `compileWorkflowSource` via `@executioncontrolprotocol/core/compile` |

Node apps and the CLI compose environments with `@executioncontrolprotocol/node`; they import compile/loaders from `@executioncontrolprotocol/core/compile` or `@executioncontrolprotocol/core/node`, not from the core main barrel.

## Typical usage

```ts
import { environment, extension, workflow, step } from "@executioncontrolprotocol/node"
import "@executioncontrolprotocol/core/testing"

const env = (await environment("dev")).withExtensions([
  extension("@executioncontrolprotocol/test").with({}),
])
const ecp = await env.init()
await ecp.run(
  workflow("Echo")
    .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hi" }).as("out")])
    .toManifest()
)
```

## Related

- [`@executioncontrolprotocol/core`](../core/README.md) — core API and subpaths
- [`@executioncontrolprotocol/cli`](../cli/) — `ecp run`, `ecp compile`, etc. (uses `@executioncontrolprotocol/core/loaders` + `@executioncontrolprotocol/core/compile`)

See [AGENTS.md](../../AGENTS.md) for CLI commands and extension catalog rules.
