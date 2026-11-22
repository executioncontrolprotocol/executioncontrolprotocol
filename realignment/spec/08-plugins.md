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

- **One name per plugin:** the plugin id is the npm package name, `@<scope>/<name>` (no `plugin-` prefix); plugin
  short = `<name>`. `ecp-plugin-manifest` fails the build when `definePlugin({ id })` differs from `package.json`
  `name`, and the host refuses to load such a plugin (`ECP_PLUGIN_LOAD_FAILED`, path `/plugin/id`). The manifest's
  `plugin.package` always equals `plugin.id`. `ecp plugins install <short>` resolves first-party short names through
  `FIRST_PARTY_PLUGINS`, and other short names to `@executioncontrolprotocol/<short>`.
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
    bytes(ref: FileRef): Promise<{ bytes: Uint8Array; mediaType?: string; name?: string }>
    stream(ref: FileRef): Promise<{ stream: ReadableStream<Uint8Array>; mediaType?: string; name?: string; cancel(): Promise<void> }>
    path(ref: FileRef): Promise<{ path: string; mediaType?: string; name?: string; temporary: boolean }>
    url(ref: FileRef): Promise<FileRefUrl>
    fromBytes(bytes: Uint8Array, options?: { mediaType?: string; name?: string }): Promise<ArtifactFileRef>
    fromStream(stream: ReadableStream<Uint8Array>, options?: { mediaType?: string; name?: string }): Promise<ArtifactFileRef>
    fromPath(filePath: string, options?: { mediaType?: string; name?: string }): Promise<ArtifactFileRef>
    fromUrl(url: string, options?: { mediaType?: string; name?: string; headers?: Record<string, string>; persist?: boolean }): Promise<FileRefUrl | ArtifactFileRef>
    read(ref: FileRef): Promise<{ bytes: Uint8Array; mediaType?: string; name?: string }>   // alias of bytes
    writeArtifact(bytes: Uint8Array, options: { mediaType: string; name?: string }): Promise<ArtifactFileRef>   // alias of fromBytes
  }
  call(capabilityId: string, input: unknown, options?: { config?: string }): Promise<unknown>   // mediated: full validation + config resolution through the host
  logger: { debug(m: string, d?: unknown): void; info(…): void; warn(…): void; error(…): void }
  usage: { record(entry: { kind: string; amount: number; unit: string; detail?: unknown }): void }
}
```

- `FileRef` kinds: `file` (`{ kind, path, mediaType?, archive? }`), `url` (`{ kind, url, headers?, mediaType?, archive? })`,
  `artifact` (`{ kind, uri: "ecp://runs/<runId>/artifacts/<name>", mediaType?, name?, sizeBytes?, archive? }`).
  After uniform capture, output refs may include `archive` (an `artifact` ref) while keeping their
  original `kind`.
  The legacy `buffer` kind is dropped.
- **Declared access** on a whole `FileRef` schema: `x-ecp-file: { access?: "bytes" | "stream" | "path" | "url", mediaTypes?: string[] }`
  (legacy `x-ecp-file: true` means any kind). Plugin SDK {@link fileRefSchema} stamps this into generated
  `ecp.schema.json`. Omitted `access` accepts all kinds. Omitted `mediaType` on the ref skips L3 media checks.
  Adobe url-only inputs use `access: "url"`. Returns annotate `x-ecp-file` without `access`.
- **Product-shaped media I/O:** capabilities that produce files return `FileRef`s in the
  capability `returns` schema (for example Firefly `generate-images` → `{ images: FileRef[] }`;
  Photoshop composite → one `FileRef` per requested output, keyed by a media-type token such as
  `png` or `psd`). Media inputs use the same `FileRef` at the capability boundary; the plugin
  expands `kind: "url"` into the vendor request envelope. Adobe media capabilities reject
  `kind: "file"` and `kind: "artifact"` at the handler with `ECP_INPUT_INVALID` and a hint to
  upload to allowlisted URL storage first.
- **File service:** built on the {@link ArtifactStore} and {@link ScratchSpace} services; run
  artifacts are written only through the store. Handlers activate on demand (no prefetch). The
  host sniffs the first 32 bytes, reconciles `mediaType`, and records corrections on the step
  (`mediaTypes`). `url` access on non-url refs fails with `ECP_INPUT_INVALID` (publish hint). URL
  fetch failures use `ECP_PROVIDER_ERROR`; logs and messages strip the query string. There is
  **no URL allowlist and no path sandbox** in the MVP; {@link HostSettings.files.maxBytes}
  caps `bytes`, `stream`, `path`, `url`, and `capture` (default 512 MiB per method, 256 MiB for
  capture). Per-step scratch copies are removed when the step ends.
- **Publisher role (F5):** a capability may set `role: "publish"` or `role: "unpublish"` on its
  manifest entry, plus `publish: { fileField?: string; locatorFields: string[] }`. After a
  successful publish step the host appends to `RunRecord.publishes` (source `FileRef`, published
  `url`, locator map; source headers stripped). After a successful unpublish it sets `deletedAt` /
  `deleteStepId` on the entry whose locator matches (`locatorFields`); no match is not an error.
  The host never branches on capability ids. **Azure Blob Storage:** `upload` is
  `role: "publish"` with `fileField: "file"` and `locatorFields: ["blobName", "container"]`; it
  returns `{ file: FileRefUrl, blobName, container }` (`createReadSas` defaults to true; omitted
  `blobName` is `ecp/<runId>/<stepId>/<name>-<8 hex><.ext>`, each segment sanitized and the extension kept). `delete` is `role: "unpublish"`
  with the same locator fields; its input shape is unchanged.
- **`file` path resolution** (in the host's `files.bytes` / `read`, not in plugins): an absolute
  path is used as-is. A relative path joins the execution directory (directory of the `.ecp.json`
  for path-started runs, or `executions/<id>.ecp.json` for id-started runs). Inline executions (no
  file) reject relative paths at read time with `ECP_INPUT_INVALID` (message names the path and
  requires an absolute path). `..` is allowed like `$script.path`.
  `CapabilityCall.executionDir` carries that directory from the executor to the adapter.
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
  "plugin": { "id": "@executioncontrolprotocol/anthropic", "package": "@executioncontrolprotocol/anthropic",
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
  wrapping) for capabilities whose manifest row does **not** set `contract: "step"`. Step-contract
  capabilities omit those `$defs` entries; the execution step carries `accepts` and `returns`.
  `$defs.config` when the plugin has a config schema.
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
   the envelope, verify `$id` and that every non-step-contract capability has `.accepts`/`.returns`
   `$defs` (step-contract capabilities skip those entries), and
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
   imported. `capabilities()` returns light rows only; on first use of a capability from an
   installed package the host reads that plugin's `ecp.schema.json` in `loadPluginSchema` (link
   mode already holds the document in memory from step 2).
5. **On first call** to a capability: import the plugin entry (cached), take the definition's
   capability, call its `handler()` thunk (cached), invoke the default export. Failures →
   `ECP_PLUGIN_LOAD_FAILED`.

## After install, link, uninstall, update or reset (CLI hook)

No trust check or allowlist in the MVP: any package oclif can install or link is accepted.
After install or link, the CLI verifies `ecp.manifest.json` / `ecp.schema.json` via the local
loader. On failure the command exits non-zero with the regenerate hint
(`Run ecp-plugin-manifest to regenerate.`), the package **stays** installed, and
`$ECP_DATA_DIR/.ecp-plugins-changed` is still touched so a running host reloads and reports
`manifestOk: false`. ECP-owned commands touch the marker **before** `writeEnvelope` because
`process.exit` skips oclif's `finally` hook; the hook remains a backstop. Uninstall, update and
reset touch the marker when the data dir changed.

## First-party plugins in the MVP

| Package | Capabilities | Notes |
| --- | --- | --- |
| `plugin-core` | `transform` (`@executioncontrolprotocol/core.transform`, `contract: "step"`, `code: "script"`) | Bundled with the host (`source: "core"` in `retrieve`); not installed under `$ECP_DATA_DIR`; survives `ecp plugins reset`; cannot be uninstalled |
| `plugin-jsonata` | `transform` (`@executioncontrolprotocol/jsonata.transform`, `contract: "step"`, `code: "expression"`) | Optional; not bundled. Each evaluation runs in a short-lived child Node process with a 64 MiB heap, killed when the step times out (capability `timeoutMs`, 1000 ms) or is cancelled, so a runaway or memory-hungry expression never affects the host. Costs roughly 75 ms of process start per step. Install with `ecp plugins install jsonata`. |
| `plugin-test` | `echo`, `fail` (throws with a given code), `delay` (ms, honours `signal`), `stage` (writes via `$state` handle), `config-echo` (returns which config keys it received and the length of `secret`, never the value), `file-roundtrip` (reads a FileRef, writes an artifact), `call` (uses `ctx.call`), `bounded` (echo length-limited string / `$script` into `maxLength`; id `@executioncontrolprotocol/test.bounded`) | Test harness for every executor/host feature; not a dependency of the host |
| `plugin-anthropic` | `generate` | Port from legacy; live test needs `ECP_SECRET_ANTHROPIC_APIKEY` |
| `plugin-azure-blob-storage` | `upload`, `download`, `sas`, `delete` | Port; live tests use Azurite if available, else skip |
| `plugin-adobe-firefly-services` | All generated families except skipped `content-tagging` (**63** capabilities) | Product-shaped returns: image jobs → `images` + `seeds`; Photoshop multi-output → token keys; manifest → layer document. Image inputs are url `FileRef`s; `photoshop-actions` accepts `options.uxp.source.content` as a string (the `$script` target). |
