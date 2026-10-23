# @executioncontrolprotocol/plugin-state-control

State-control policy for ECP (Execution Control Protocol). Install with:

```sh
ecp plugins install state-control
```

Policy id `@executioncontrolprotocol/state-control` is unchanged. Core's
`MISSING_STATE_CONTROL_POLICY` check points here. This plugin has no commands. After
install it appears in `ecp describe --policies`.

## Binding

```ts
import stateControlPolicy from "@executioncontrolprotocol/plugin-state-control"
import { environment, policy, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"

export default environment(NODE_ENVIRONMENT_ID, "state-demo").with([
  policy(stateControlPolicy).with({
    allowedMutablePaths: ["brief"],
    allowedMutationOps: ["set", "replace"],
  }),
])
```

Or install the plugin and bind `policy("@executioncontrolprotocol/state-control")` by id.

## Config

| Field | Description |
| --- | --- |
| `allowedMutablePaths` | Paths a step may mutate. Omit to allow any path not denied. |
| `deniedMutablePaths` | Paths that always deny, even if also listed as allowed. |
| `allowedMutationOps` | Allowed ops: `set`, `replace`, `merge`, `append`. |
| `requireReason` | When true, every mutation needs a non-empty reason. |
| `maxMutationsPerStep` | Deny when a step queues more mutations than this. |

No `secrets("…")` keys.

## Authoring

`toCommands()` is empty. `ecp plugins build` still writes the oclif plugin block so
`@oclif/plugin-plugins` can install it.
