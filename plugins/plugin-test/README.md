# @executioncontrolprotocol/plugin-test

Stub echo and placeholder capabilities for ECP (Execution Control Protocol) examples and tests. They are **not** built into the Node host. Install or link the plugin (or bind `testExtension` in an `--env` / `createTestEnvironment` host):

```sh
ecp plugins link plugins/plugin-test
ecp plugins install test
```

Capability ids (`@executioncontrolprotocol/test.echo` and the summarize/translate/notify/validate stubs) are unchanged.

## Binding

```ts
import { workflow, step, extension } from "@executioncontrolprotocol/core"

export default workflow("Echo test")
  .with([extension("@executioncontrolprotocol/test")])
  .run([
    step("@executioncontrolprotocol/test.echo", "Echo")
      .with({ value: "hello from fluent API" })
      .as("echo"),
  ])
```

Or bind the definition in a test host:

```ts
import { extension, testExtension } from "@executioncontrolprotocol/core"
import { environment, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"

export default environment(NODE_ENVIRONMENT_ID, "test").with([
  extension(testExtension),
])
```

## Capability: `@executioncontrolprotocol/test.echo`

**Input:** `{ value? }` — echoed value (defaults to `"hi"`).

**Output:** `{ echo }` — the supplied value.

```sh
ecp test echo --value hello --json
ecp environments invoke @executioncontrolprotocol/test.echo --input payload.json --json
```

## Authoring

This package re-exports `testExtension` from `@executioncontrolprotocol/core`. `ecp plugins build` generates the oclif files. Do not hand-write command classes.
