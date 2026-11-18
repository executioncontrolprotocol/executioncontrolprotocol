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

Build writes light `ecp.manifest.json` (2.0) and `ecp.schema.json` via `ecp-plugin-manifest`.
The installable package also needs an empty `"oclif": {}` key in `package.json` (first-party
plugins include it).
Peer-depend on `plugin-sdk` and `zod`. Never import `@executioncontrolprotocol/host`, `cli`,
`mcp-relay`, or `app`.

**Reference implementation:** `plugins/plugin-test` (echo, fail, delay, stage, config-echo,
file-roundtrip, call, bounded).

Provider failures must surface as `ECP_PROVIDER_ERROR` with a readable `message` and optional
`details` (see `.cursor/rules/extensions.mdc` and spec `08-plugins`).
