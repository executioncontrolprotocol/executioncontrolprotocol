# @executioncontrolprotocol/jsonata

JSONata expression transform for ECP. Agents author expressions; workflows sequence transforms over object payloads with standard `$ref` chaining.

Runs **locally** in Node and browser (pure JS; no host hop).

## Binding

```ts
import "@executioncontrolprotocol/jsonata"
import { environment, extension } from "@executioncontrolprotocol/node"

export default environment("jsonata-demo").withExtensions([
  extension("@executioncontrolprotocol/jsonata").with({}),
])
```

## Capability: `@executioncontrolprotocol/jsonata.transform`

**Input:** `{ expression, payload, bindings? }`

- `expression` — JSONata expression string (agent-authored)
- `payload` — document to evaluate against (literal or `ref(...)`)
- `bindings` — optional named variables assigned before evaluation

**Output:** `{ result }` — evaluation result (any JSON-compatible value).

## Chaining

```ts
step("@executioncontrolprotocol/jsonata.transform", "Project fields")
  .with({
    expression: '{ "name": name, "total": price * qty }',
    payload: ref("echo.echo"),
  })
  .as("projected")
```

With bindings (reference assigned names as `$factor`):

```ts
step("@executioncontrolprotocol/jsonata.transform", "Scale total")
  .with({
    expression: "total * $factor",
    payload: ref("projected.result"),
    bindings: { factor: 2 },
  })
  .as("scaled")
```
