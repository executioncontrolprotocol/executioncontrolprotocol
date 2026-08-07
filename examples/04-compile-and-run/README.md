# Compile and run (dual mode)

## TypeScript fluent API (in process)

```ts
import { workflow, step } from "@executioncontrolprotocol/core"
import { environment, extension } from "@executioncontrolprotocol/node"
import "@executioncontrolprotocol/core/testing"

const manifest = workflow("Demo").run([...]).toManifest()
const env = (await environment("dev")).withExtensions([extension("@executioncontrolprotocol/test").with({})])
await env.run(manifest)
```

## Compile to JSON

```bash
ecp compile ../01-echo/workflow.ts -o dist/workflow.json
ecp compile ../01-echo/workflow.js -o dist/workflow-js.json
```

## Run directly (compile at runtime)

TypeScript and JavaScript workflows are compiled in memory — no `ecp compile` step required:

```bash
ecp validate examples/01-echo/workflow.ts --env examples/01-echo/environment.ts
ecp run examples/01-echo/workflow.ts --env examples/01-echo/environment.ts
ecp run examples/01-echo/workflow.js --env examples/01-echo/environment.ts
```

## Validate and run JSON (optional)

```bash
ecp compile ../01-echo/workflow.ts -o dist/workflow.json
ecp validate dist/workflow.json --env ../01-echo/environment.ts
ecp run dist/workflow.json --env ../01-echo/environment.ts
```

## Help

```bash
ecp --help
ecp run --help
```
