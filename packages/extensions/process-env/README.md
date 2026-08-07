# @executioncontrolprotocol/process-env

Resolves `env("KEY")` / `{ "$env": "KEY" }` environment bindings from `process.env`.

```ts
import "@executioncontrolprotocol/process-env"
import { environment, extension, env } from "@executioncontrolprotocol/node"

const envBuilder = (await environment("demo")).withExtensions([
  extension("@executioncontrolprotocol/process-env").with({}),
])
```
