# @executioncontrolprotocol/plugin-budget

Budget policy for ECP (Execution Control Protocol). Install with:

```sh
ecp plugins install budget
```

Policy id `@executioncontrolprotocol/budget` is unchanged. This plugin has no commands. After
install it appears in `ecp environments describe --policies`.

## Binding

```ts
import budgetPolicy from "@executioncontrolprotocol/plugin-budget"
import { environment, policy, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"

export default environment(NODE_ENVIRONMENT_ID, "budget-demo").with([
  policy(budgetPolicy).with({ maxModelCalls: 20, maxCostUsd: 1 }),
])
```

Or install the plugin and bind `policy("@executioncontrolprotocol/budget")` by id.

## Config

| Field | Description |
| --- | --- |
| `maxModelCalls` | Deny when model calls reach (pre) or exceed (post) this count. |
| `maxCostUsd` | Deny when cost reaches or exceeds this amount. |
| `maxTokens` | Deny when tokens reach or exceed this count. |
| `maxRetries` | Deny when retries reach or exceed this count. |

No `secrets("…")` keys.

## Authoring

`toCommands()` is empty. `ecp plugins build` still writes the oclif plugin block so
`@oclif/plugin-plugins` can install it.
