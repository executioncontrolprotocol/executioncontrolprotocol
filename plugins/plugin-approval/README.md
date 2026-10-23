# @executioncontrolprotocol/plugin-approval

Approval policy for ECP (Execution Control Protocol). Install with:

```sh
ecp plugins install approval
```

Policy id `@executioncontrolprotocol/approval` is unchanged. Pausing a step returns
`ECP_RUN_PAUSED`. Resume after recording an approval with `ecp runs resume --approve`.

This plugin has no commands. After install it appears in `ecp describe --policies`.

## Binding

```ts
import approvalPolicy from "@executioncontrolprotocol/plugin-approval"
import { environment, policy, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"

export default environment(NODE_ENVIRONMENT_ID, "approval-demo").with([
  policy(approvalPolicy).with({
    requireApprovalFor: ["@executioncontrolprotocol/test.echo"],
  }),
])
```

Or install the plugin and bind `policy("@executioncontrolprotocol/approval")` by id.

## Config

| Field | Description |
| --- | --- |
| `requireApprovalFor` | Capability ids that pause until the journal records an approval for that step. |

No `secrets("…")` keys.

## Authoring

`toCommands()` is empty. `ecp plugins build` still writes the oclif plugin block so
`@oclif/plugin-plugins` can install it.
