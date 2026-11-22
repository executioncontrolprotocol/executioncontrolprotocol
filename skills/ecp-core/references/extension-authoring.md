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

**One name per plugin.** The plugin `id` must be the npm package name in `package.json` (`"name":
"@executioncontrolprotocol/test"` above), with no `plugin-` prefix. Capability ids are `${id}.${name}`. The manifest
build fails if the two differ, and the host refuses to load such a plugin. `ecp plugins install test` works because
first-party short names map to the full name.

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

### JSONata vs core transform

Use **core.transform** (`code: "script"`) when you need full JavaScript on step input inside the host
QuickJS sandbox (default transform budget 1000 ms). Use **jsonata.transform**
(`@executioncontrolprotocol/jsonata`, `code: "expression"`) for declarative field projection and
filtering with JSONata; install the plugin separately. Each JSONata step runs in its own short-lived
process (64 MiB heap, 1000 ms), so it costs roughly 75 ms more than a QuickJS transform.

See `examples/transform-jsonata/` for a JSONata workflow.

## Publishing (F5)

Upload-to-URL capabilities are explicit execution steps, not hidden host work:

```ts
export const upload = capability({
  // …
  returns: z.object({ file: urlFileRefSchema, blobName: z.string(), container: z.string() }),
  role: "publish",
  publish: { fileField: "file", locatorFields: ["blobName", "container"] },
  handler: () => import("./capabilities/upload.js"),
})

export const deleteBlob = capability({
  // …
  role: "unpublish",
  publish: { locatorFields: ["blobName", "container"] },
  handler: () => import("./capabilities/delete.js"),
})
```

Callers bind the upload `file` output into url-only Adobe inputs. The host records each publish on
the run and marks deletions when an unpublish locator matches.

After a successful step, the host **captures every `FileRef` in the output** (unless the step sets
`persist: false`): downloads urls, copies files, records artifacts, and adds optional `archive` on
each ref while keeping its `kind`. Capture failures go on `step.captured[]` and `step.warning`
events; they do not fail the step. Use `fileRefSchema` so `archive` is not stripped from JSON Schema.

Build writes light `ecp.manifest.json` (2.0) and `ecp.schema.json` via `ecp-plugin-manifest`.
The installable package also needs an empty `"oclif": {}` key in `package.json` (first-party
plugins include it).
Peer-depend on `plugin-sdk` and `zod`. Never import `@executioncontrolprotocol/host`, `cli`,
`mcp-relay`, or `app`.

**Reference implementation:** `plugins/plugin-test` (echo, fail, delay, stage, config-echo,
file-roundtrip, call, bounded).

Provider failures must surface as `ECP_PROVIDER_ERROR` with a readable `message` and optional
`details` (see `.cursor/rules/extensions.mdc` and spec `08-plugins`).

## Product-shaped HTTP outputs (Adobe Firefly Services)

Generated Adobe capabilities return **product shapes**, not raw job JSON: Firefly image jobs expose
`images` (url `FileRef`s) and `seeds`; Photoshop composite steps expose one `FileRef` per requested
output keyed by a media-type token (`png`, `psd`, …); `photoshop-generate-manifest` returns the
layer document (`layers`, `document`). Bind `state.generate.images.0` or `state.banner.png`, not
`outputs[0].image.url`. Image inputs on Adobe steps are url `FileRefs` only (`kind: "url"`). Author them with
`fileRefSchema({ access: "url", mediaTypes?: [...] })` from `@executioncontrolprotocol/plugin-sdk`
so `x-ecp-file` lands in `ecp.schema.json` for L3 and the App (`url` port labels).
