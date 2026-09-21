# @executioncontrolprotocol/slack

Slack notification extension for ECP (mock `send` handler in v1).

## Binding

```ts
import "@executioncontrolprotocol/slack"
import { environment, extension } from "@executioncontrolprotocol/node"

export default environment("slack-demo").withExtensions([
  extension("@executioncontrolprotocol/slack").with({
    botToken: "…",
    defaultChannel: "#general",
  }),
])
```

## Capability: `@executioncontrolprotocol/slack.send`

**Input:** `{ message, channel? }`

**Output:** `{ ok, ts? }`
