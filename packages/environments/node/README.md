# @executioncontrolprotocol/node

**Node.js environment** for ECP: Node executor, default secrets, process-env, and journal
bindings, workflow compile, and file loaders.

## vs `@executioncontrolprotocol/core`

| Package | Role |
| ------- | ---- |
| `@executioncontrolprotocol/core` | Host-agnostic API and in-memory engine |
| `@executioncontrolprotocol/node` | Node environment: `process.env`, OS keychain secrets, `compileWorkflowSource`, file loaders |

Node apps and the CLI compose environments with `@executioncontrolprotocol/node`.

## Typical usage

```ts
import {
  environment,
  extension,
  workflow,
  step,
  NODE_ENVIRONMENT_ID,
  testExtension,
} from "@executioncontrolprotocol/node"

const env = environment(NODE_ENVIRONMENT_ID, "dev").with([
  extension(testExtension),
])
const ecp = await env.init()
await ecp.run(
  workflow("Echo")
    .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hi" }).as("out")])
    .toManifest()
)
```

`secrets()` and `env()` resolve with no explicit binding: the Node definition binds those
extensions by default, along with the journal writer (`@executioncontrolprotocol/journal`).
`test.echo` is **not** a Node default; bind `testExtension` or install
`@executioncontrolprotocol/plugin-test`. Journals land under `.ecp/runs/<runId>/` unless
`ECP_RUNS_DIR` is set.

## Related

- [`@executioncontrolprotocol/core`](../../core/README.md) — core API
- [`@executioncontrolprotocol/cli`](../../cli/) — `ecp run`, `ecp compile` (uses this package)

See [AGENTS.md](../../../AGENTS.md) for CLI commands.
