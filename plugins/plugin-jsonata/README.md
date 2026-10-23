# @executioncontrolprotocol/plugin-jsonata

JSONata expression transform for ECP (Execution Control Protocol). Install with:

```sh
ecp plugins install jsonata
```

Capability id `@executioncontrolprotocol/jsonata.transform` is unchanged. Agents author expressions; workflows sequence transforms over object payloads with standard `$ref` chaining.

Runs **locally** in Node and browser (pure JS; no host hop).

## Binding

```ts
import jsonataExtension from "@executioncontrolprotocol/plugin-jsonata"
import { environment, extension, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"

export default environment(NODE_ENVIRONMENT_ID, "jsonata-demo").with([
  extension(jsonataExtension),
])
```

Or install the plugin and let the CLI host load it.

## Capability: `@executioncontrolprotocol/jsonata.transform`

**Input:** `{ expression, payload, bindings? }`

- `expression` — JSONata expression string (agent-authored)
- `payload` — document to evaluate against (literal or `ref(...)`)
- `bindings` — optional named variables assigned before evaluation

**Output:** `{ result }` — evaluation result (any JSON-compatible value).

```sh
ecp jsonata transform --expression '$.a' --input payload.json --json
```

## Authoring

This package keeps `src/index.ts` and a minimal `package.json`. `ecp plugins build` generates the oclif files. Do not hand-write command classes.
