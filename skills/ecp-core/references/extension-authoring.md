# Plugin authoring

Plugins provide **capabilities only**. Author with `@executioncontrolprotocol/plugin-sdk`:

```ts
import { capability, definePlugin } from "@executioncontrolprotocol/plugin-sdk"
import { z } from "zod"

export const echo = capability({
  summary: "Echo a value.",
  description: "Returns the input value under `echo`.",
  useCases: ["Round-trip a value"],
  projections: ["Take `echo`"],
  accepts: z.object({ value: z.unknown().optional() }),
  returns: z.object({ echo: z.unknown() }),
  handler: () => import("./capabilities/echo.js"),
})

export default definePlugin({
  id: "@executioncontrolprotocol/test",
  summary: "…",
  description: "…",
  capabilities: { echo },
})
```

## Step contracts (transforms)

Set `contract: "step"` and `code: "script" | "expression"` on the capability. The manifest
omits that capability's `accepts`/`returns` `$defs`; the execution step declares both schemas.

```ts
export const transform = capability({
  summary: "Run a JavaScript transform in the host sandbox.",
  description: "Reads resolved step input and returns JSON declared on the step.",
  useCases: ["Map or reshape data between steps"],
  projections: ["Take the fields declared in the step returns schema"],
  contract: "step",
  code: "script",
  accepts: z.object({}), // omitted from ecp.schema.json $defs when contract is step
  returns: z.object({}),
  handler: () => import("./capabilities/transform.js"),
})
```

Minimal execution step (bundled `@executioncontrolprotocol/core.transform`):

```json
{
  "id": "Reshape",
  "uses": "@executioncontrolprotocol/core.transform",
  "accepts": {
    "type": "object",
    "properties": { "value": { "type": "string" } },
    "required": ["value"]
  },
  "returns": {
    "type": "object",
    "properties": { "upper": { "type": "string" } },
    "required": ["upper"]
  },
  "script": { "$script": { "lang": "js", "source": "return { upper: input.value.toUpperCase() }" } },
  "input": { "value": { "$ref": "state.doc.value" } },
  "as": "upper"
}
```

See `examples/transform/` for a runnable workflow.

Build writes light `ecp.manifest.json` (2.0) and `ecp.schema.json` via `ecp-plugin-manifest`.
The installable package also needs an empty `"oclif": {}` key in `package.json` (first-party
plugins include it).
Peer-depend on `plugin-sdk` and `zod`. Never import `@executioncontrolprotocol/host`, `cli`,
`mcp-relay`, or `app`.

**Reference implementation:** `plugins/plugin-test` (echo, fail, delay, stage, config-echo,
file-roundtrip, call, bounded).

Provider failures must surface as `ECP_PROVIDER_ERROR` with a readable `message` and optional
`details` (see `.cursor/rules/extensions.mdc` and spec `08-plugins`).
