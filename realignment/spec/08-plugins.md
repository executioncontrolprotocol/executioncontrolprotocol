# 08 — Plugins

A plugin is an npm package that provides **capabilities only**. Everything else (formatting,
storage, secrets, auth) is a host service.

## Authoring API (`@executioncontrolprotocol/plugin-sdk`)

```ts
// src/index.ts — the definition: schemas and metadata only, no handler code imported here
import { definePlugin, capability } from "@executioncontrolprotocol/plugin-sdk"
import { z } from "zod"

export default definePlugin({
  id: "@executioncontrolprotocol/anthropic",            // plugin id; capability ids are `${id}.${name}`
  summary: "Claude models from Anthropic.",
  description: "…",
  config: z.object({ apiKey: z.string(), model: z.string().default("claude-sonnet-5") }),
  capabilities: {
    generate: capability({
      summary: "Generate text with a Claude model.",
      description: "…",
      useCases: ["Draft or rewrite text from a prompt"],
      projections: ["Take `text`; `usage` reports tokens"],
      accepts: z.object({ prompt: z.string(), system: z.string().optional(), maxTokens: z.number().int().positive().optional() }),
      returns: z.object({ text: z.string(), usage: z.object({ inputTokens: z.number().int(), outputTokens: z.number().int() }) }),
      timeoutMs: 120_000,
      handler: () => import("./capabilities/generate.js"),   // lazy: module's default export is the handler
    }),
  },
})
```

```ts
// src/capabilities/generate.ts — the handler
import type { Handler } from "@executioncontrolprotocol/plugin-sdk"
import type { generate } from "../index.js"   // helper type exports: CapabilityInput/Output/Config
const handler: Handler<typeof generate> = async (input, ctx) => { /* … */ return { text, usage } }
export default handler
```

Rules:

- Package name `@<scope>/plugin-<name>`; plugin id `@<scope>/<name>`; plugin short = `<name>`.
- `capabilities` keys: `^[a-z][a-z0-9-]{0,63}$`.
- `metadata` text is product prose for agents (`.cursor/rules/extensions.mdc`); `useCases` and
  `projections` each need at least one entry (manifest build fails otherwise).
- `handler` MUST be a lazy `import()` thunk so building the registry never loads handler code.
- `package.json`: `"type": "module"`, `"exports": { ".": "./dist/index.js", "./ecp.manifest.json": "./ecp.manifest.json", "./ecp.schema.json": "./ecp.schema.json" }`,
  `"keywords": ["ecosystem:ecp-plugin"]`, `"ecp": { "manifest": "./ecp.manifest.json", "schema": "./ecp.schema.json" }`,
  `peerDependencies` on `@executioncontrolprotocol/plugin-sdk` and `zod`, `files` include
  `dist`, `ecp.manifest.json` and `ecp.schema.json`.

## Handler context

```ts
type Handler<C> = (input: CapabilityInput<C>, ctx: HandlerContext<PluginConfig<C>>) => Promise<CapabilityOutput<C>>
interface HandlerContext<Config> {
  config: Config                                   // resolved (secrets in place); undefined if the plugin has no config
  signal: AbortSignal                              // aborted on cancel, timeout, parallel sibling failure
  run: { id: string }
  step: { id: string; round?: number }
  state: DeepReadonly<Record<string, unknown>>     // snapshot at step start
  store: {                                         // staged writes on $state handles; applied only if the step succeeds
    set(handle: StateHandle, value: unknown): void
    merge(handle: StateHandle, value: Record<string, unknown>): void
    append(handle: StateHandle, value: unknown): void
  }
  files: {
    read(ref: FileRef): Promise<{ bytes: Uint8Array; mediaType?: string; name?: string }>
    writeArtifact(bytes: Uint8Array, options: { mediaType: string; name?: string }): Promise<ArtifactFileRef>
  }
  call(capabilityId: string, input: unknown, options?: { config?: string }): Promise<unknown>   // mediated: full validation + config resolution through the host
  logger: { debug(m: string, d?: unknown): void; info(…): void; warn(…): void; error(…): void }
  usage: { record(entry: { kind: string; amount: number; unit: string; detail?: unknown }): void }
}
```

- `FileRef` kinds: `file` (`{ kind, path, mediaType? }`, absolute path), `url` (`{ kind, url, headers?, mediaType? }`),
  `artifact` (`{ kind, uri: "ecp://runs/<runId>/artifacts/<name>", mediaType?, name?, sizeBytes? }`).
  The legacy `buffer` kind is dropped.
- `ctx.call` counts as a nested step for events (`step.start` with `parentNodeId`) and is
  subject to the same timeout budget as the calling step.
- Usage entries are written to the step record.
- Handlers MUST honour `signal` for long operations and polling.

## Provider and handler failures

When a capability fails because an upstream API, SDK, or network call failed:

1. Throw an `Error` whose `message` includes the **provider's own error text** when available
   (not only an HTTP status). Prefer
   `"<service> returned HTTP <status>: <provider text>"`.
2. Set `error.code` to `ECP_PROVIDER_ERROR` (or another catalogue code when it fits).
3. Set `error.details` to a plain object with at least `status` (HTTP) and `body` (parsed JSON
   or truncated text), plus useful redacted context (method, URL without query, endpoint).
4. Never put secret values in `message` or `details`.

The executor copies `message`, `code`, and `details` onto the step and run failure issues after
secret redaction (`04-executor.md`). Agents inspect runs; they must not need provider logs.
Authoring rule: `.cursor/rules/extensions.mdc` ("Provider and handler failures").

## `ecp.manifest.json`

Generated by `ecp-plugin-manifest` (bin in `plugin-sdk`), run as part of the plugin's `build`
script after `tsc`. Version **2.0** is a light index: no embedded `accepts`/`returns`/
`configSchema`. Schemas live in `ecp.schema.json` (see below); the manifest points at that
file with `pluginSchema: { path, hash }`.

```json
{ "schema": "@executioncontrolprotocol.plugin-manifest", "version": "2.0",
  "plugin": { "id": "@executioncontrolprotocol/anthropic", "package": "@executioncontrolprotocol/plugin-anthropic",
              "version": "1.0.0", "summary": "…", "description": "…" },
  "sdkVersion": "1.0.0",
  "pluginSchema": { "path": "./ecp.schema.json", "hash": "<sha256 of canonical ecp.schema.json>" },
  "capabilities": [
    { "id": "@executioncontrolprotocol/anthropic.generate", "name": "generate",
      "summary": "…", "description": "…", "useCases": ["…"], "projections": ["…"],
      "timeoutMs": 120000 } ],
  "entry": "./dist/index.js",
  "hash": "sha256 of the canonical JSON of everything above" }
```

- Deterministic output (sorted keys, no timestamps) so the light manifest diffs cleanly.
- `plugin.version` MUST equal `package.json` `version`.
- Version `1.0` (fat) manifests are rejected; regenerate with `ecp-plugin-manifest`.

## `ecp.schema.json`

Also emitted by `ecp-plugin-manifest` (same build step as the light manifest; required):

- Draft 2020-12 document with `$id: ecp://plugins/<plugin-id>/<version>/schema.json`.
- `$defs.<capabilityName>.accepts` / `$defs.<capabilityName>.returns` (raw schemas, no marker
  wrapping); `$defs.config` when the plugin has a config schema.
- JSON Schemas from zod with `z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" })`
  for `accepts`/`config` and `io: "output"` for `returns`; `$schema` keys stripped inside `$defs`
  (the document itself keeps `$schema`).
- Shared shapes from `protocol` are referenced by absolute `$id`
  (`ecp://protocol/<name>.schema.json`), never copied.
- Must validate standalone (plugin CI compiles it and checks examples).
- Single source for all capability schemas; the light manifest's `pluginSchema.hash` must match
  this file (`--check` verifies both).
- Missing or invalid `ecp.schema.json` for an installed (non-link) package → plugin
  `manifestOk: false` with a clear issue and a suggestion to run `ecp-plugin-manifest`. Link
  mode may supply both documents in memory.

## Loading (`LocalPluginRegistration`)

1. **Plugin list:** read `$ECP_DATA_DIR/package.json` (oclif user plugins: `dependencies`) and
   oclif's link records (`oclif.plugins` entries with `type: "link"` → `root`). Plus any
   packages in `HostSettings.extraPlugins` (tests).
2. **Per plugin:** resolve the package root; read the light `ecp.manifest.json` (via
   `package.json` `ecp.manifest`). Validate it against the plugin-manifest schema (version
   **2.0**); check `plugin.version === package.json.version`. Load `ecp.schema.json` (path from
   `pluginSchema.path`, else `package.json` `ecp.schema`, else `./ecp.schema.json`), validate
   the envelope, verify `$id` and that every capability has `.accepts`/`.returns` `$defs`, and
   verify `pluginSchema.hash` matches the canonical schema document. Linked plugins: regenerate
   **both** documents in memory by importing the definition entry (dev loop; no handler code is
   imported because handlers are lazy); disk schema files are not required in link mode.
3. Problems (missing/invalid manifest or schema document, version mismatch, hash mismatch,
   duplicate capability id across plugins) mark the plugin `manifestOk: false` with issues
   visible through `retrieve { type: "plugin" }`; its capabilities are not registered. The host
   still starts. Suggest running `ecp-plugin-manifest` when the schema file is missing or
   stale.
4. **Registry** = capability entries assembled from good light manifests plus their schema
   documents (`accepts`/`returns`/`configSchema` filled from `$defs`). No plugin code is
   imported. (Lazy per-use schema reading arrives in a later ship; S1 still loads both
   documents at host start.)
5. **On first call** to a capability: import the plugin entry (cached), take the definition's
   capability, call its `handler()` thunk (cached), invoke the default export. Failures →
   `ECP_PLUGIN_LOAD_FAILED`.

## After install, link, uninstall or update (CLI hook)

No trust check or allowlist in the MVP: any package oclif can install or link is accepted.
After a successful install or link, the CLI verifies that `ecp.manifest.json` exists and
validates (it warns, and doesn't uninstall, if not), then touches the marker so a running host
restarts. Uninstall and update touch the marker too.

## First-party plugins in the MVP

| Package | Capabilities | Notes |
| --- | --- | --- |
| `plugin-test` | `echo`, `fail` (throws with a given code), `delay` (ms, honours `signal`), `stage` (writes via `$state` handle), `config-echo` (returns which config keys it received and the length of `secret`, never the value), `file-roundtrip` (reads a FileRef, writes an artifact), `call` (uses `ctx.call`), `bounded` (echo length-limited string / `$script` into `maxLength`; id `@executioncontrolprotocol/test.bounded`) | Test harness for every executor/host feature; not a dependency of the host |
| `plugin-anthropic` | `generate` | Port from legacy; live test needs `ECP_SECRET_ANTHROPIC_APIKEY` |
| `plugin-azure-blob-storage` | `upload`, `download`, `sas` | Port; live tests use Azurite if available, else skip |
| `plugin-adobe-firefly-services` | Generated capabilities currently in `GENERATED_FAMILIES` (Firefly + Photoshop); six more families stay pending until schema-scale ship (S6) | Keep the HTTP input/output rules in `extensions.mdc`; `photoshop-actions` accepts `options.uxp.source.content` as a string (the `$script` target). Pending families remain blocked until S6 / the validation-at-scale plan's ship section. |
