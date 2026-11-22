# 05 — Objects and storage

All objects are JSON. Schema ids `@executioncontrolprotocol.<object>`, each with a JSON Schema
in `protocol` (`packages/protocol/schemas/*.schema.json`).

## `$ECP_HOME` layout (default `~/.ecp`)

```text
$ECP_HOME/
├── host.json                       supervisor/host discovery (09), mode 0600
├── logs/
│   ├── supervisor.log              rotated at 5 MB, keep 3
│   └── host.log                    rotated at 5 MB, keep 3
├── plugins/                        oclif data dir (ECP_DATA_DIR): package.json, node_modules, links
│   └── .ecp-plugins-changed        marker file touched after install/uninstall/link/update
├── schema/
│   └── execution.schema.json       generated, for editors (03)
├── cache/
│   └── validators/<schemaHash>/    optional on-disk cache of compiled-schema inputs
├── store/
│   ├── executions/<id>.ecp.json    saved executions (manifest only)
│   ├── executions/<id>.meta.json   { id, version, manifestHash, createdAt, updatedAt, warnings }
│   └── configs/<plugin-short>/<name>.json
├── runs/<runId>/
│   ├── run.json                    run record
│   ├── manifest.ecp.json           exact manifest that ran (for resume and audit)
│   ├── state.json                  latest committed state (see note below)
│   ├── steps/<nodeId>[#i<items>][#<round>].json
│   ├── loop-items/<nodeId>.json    finished items of an outermost forEach loop (resume)
│   ├── events.ndjson
│   └── artifacts/                  files written by capabilities (08)
```

Note on `state.json`: it holds the real state needed for resume. Secret values are never in
state (they're only in resolved config, which isn't stored), and capability outputs are
redacted before commit (04), so `state.json` is safe to keep on disk.

## Writes

- **Atomic:** write `<file>.<pid>.<random>.tmp`, `fsync`, then `rename` over the target. On
  Windows, retry `rename` up to 5 times with 20/40/80/160/320 ms backoff on `EPERM`/`EBUSY`.
- **Version checks:** updates to executions and configs take a lock file `<file>.lock`
  (`O_EXCL`; stale after 10 s), re-read the current `version`, compare with `ifVersion`, write,
  release.
- **Change notifications:** `StorageProvider.watch` uses `fs.watch` on `store/` and `runs/`
  with a 100 ms debounce, plus a 2 s poll fallback (network drives, WSL mounts).

## Execution (saved)

- Stored manifest = the committed manifest with `execution.id` set to the id.
- Meta: `{ "id", "version": n, "manifestHash", "createdAt", "updatedAt", "warnings": [Issue] }`.
- `version` starts at 1 and increments on every update.

## Config object

```json
{ "schema": "@executioncontrolprotocol.config", "version": "1.0",
  "id": "anthropic/default", "plugin": "@executioncontrolprotocol/anthropic",
  "values": { "model": "claude-sonnet-5", "apiKey": { "$secret": "anthropic.apiKey" } },
  "objectVersion": 3, "updatedAt": "…" }
```

- `id`: `<plugin-short>/<name>`; `plugin-short` = plugin id without scope (`anthropic`); `name`
  `^[a-z0-9][a-z0-9-]{0,63}$`. `<plugin-short>/default` is used when a step names no config.
- `values` validated against the plugin's config schema after treating `{ "$secret" }` and
  `{ "$env" }` objects as strings.
- `retrieve` returns `values` as stored (references, never resolved values).

## Secrets

- `SecretsProvider` local implementation: OS keychain via `@napi-rs/keyring`, service `ecp`,
  naming rules in `.cursor/rules/secrets-keyring.mdc`.
- Read-only fallback: environment variable `ECP_SECRET_<KEY>` where `<KEY>` is the secret key
  upper-cased with every non-alphanumeric character replaced by `_`
  (`anthropic.apiKey` → `ECP_SECRET_ANTHROPIC_APIKEY`). Keychain wins if both exist.
  CI and containers use the env form.
- Keys: `^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$`.
- Values are only written by `ecp config secrets set` (never through MCP or the HTTP API).

## Run record (`run.json`)

```json
{ "schema": "@executioncontrolprotocol.run", "version": "1.0",
  "id": "run-20261115T101500Z-3f9a1c",
  "execution": { "id": "localize-banner", "path": null, "manifestHash": "…", "executionVersion": 4 },
  "status": "completed",
  "input": { … }, "result": { … }, "error": null,
  "startedAt": "…", "endedAt": "…", "durationMs": 8123,
  "plugins": { "@executioncontrolprotocol/anthropic": "1.0.0" },
  "host": { "version": "1.0.0", "pid": 1234, "mode": "server" },
  "clientRequestId": "…",
  "cursor": { "completed": ["doc", "check-headline", "translate"], "inProgress": "banner", "loops": { "refine": 1 }, "branches": { "check-headline": 1 }, "loopItems": { "variants": { "completed": [0, 1] } } },
  "warnings": [], "publishes": [], "timing": { … } }
```

- `publishes`: one entry per successful publish step (`role: "publish"` on the capability). Each
  records `stepId`, `round`, `capabilityId`, `at`, the source `FileRef` (headers stripped),
  the published `url` (query retained), and a `locator` map from `publish.locatorFields` on the
  manifest. A successful unpublish step sets `deletedAt` and `deleteStepId` on the matching entry;
  no match is not an error. Visible through `retrieve` on the run.
- `host.pid`: integer ≥ 1 (the process that ran the operation).
- `host.mode`: `"in-process"` or `"server"` (required with `pid`).
- Run id: `run-<UTC yyyymmddTHHMMSSZ>-<6 hex>`.
- `result`: if `execution.returns` exists, an object with exactly those keys from state;
  otherwise every key committed by `as` during the run.
- `input`, `result`, step inputs/outputs are redacted (04).

## Step record (`steps/<nodeId>[#i<items>][#<round>].json`)

```json
{ "nodeId": "translate", "round": null, "capabilityId": "…", "status": "completed",
  "input": { … }, "output": { … }, "error": null,
  "script": "return { greeting: input.name }", "expression": null,
  "config": { "id": "anthropic/default", "version": 3 },
  "startedAt": "…", "endedAt": "…", "durationMs": 912,
  "staged": [ { "op": "append", "path": "history", "valuePreview": "…" } ],
  "captured": [ { "path": "image", "source": { "kind": "url", "url": "https://example.test/a.png" },
    "artifact": { "kind": "artifact", "uri": "ecp://runs/<runId>/artifacts/<name>", "mediaType": "image/png" } } ] }
```

`captured` lists every `FileRef` the executor processed on a successful step: `path` (JSON
pointer in the step output), `source` (kind plus url without query, path, or uri), optional
`artifact`, or `error` when capture failed.

When a transform runs in QuickJS, `script` holds the source text that ran (inline `source` or
resolved `path` file). When `code` is `"expression"`, `expression` holds the step's expression
string. The run's manifest snapshot does not embed bytes from a `path` script file.

Status: `completed`, `failed`, `skipped`, `cancelled`.

Inside a `forEach` loop, the record carries `items` (item indexes, outermost first) and the file
name adds `#i<items>` joined with `.` before any round: `render#i2.json`, `tick#i2.4#1.json`. The
`i` keeps item 2 apart from loop round 2. Captured artifact names follow the same rule
(`step-i2.4-r1-…`).

## forEach partial results (`loop-items/<nodeId>.json`)

```json
{ "results": { "0": { … }, "2": null }, "errors": [ { "index": 2, "error": { … } } ] }
```

Written atomically after each finished item of an outermost `forEach` loop. A present key is a
recorded result (`null` for an item that failed under `onError: "continue"`). Resume reads this
file; the cursor's `loopItems` map is a summary written with the run record. A run record without
`loopItems` in its cursor reads as `{}`.

## Capability entry (`retrieve` item)

```json
{ "id": "@executioncontrolprotocol/anthropic.generate", "plugin": "@executioncontrolprotocol/anthropic",
  "package": "@executioncontrolprotocol/anthropic", "pluginVersion": "1.0.0",
  "summary": "…", "description": "…", "useCases": ["…"], "projections": ["…"],
  "accepts": { … }, "returns": { … },   "configSchema": { … }, "timeoutMs": 120000,
  "contract": "step", "code": "script",
  "role": "publish", "publish": { "fileField": "file", "locatorFields": ["blobName", "container"] } }
```

`role` and `publish` appear on publisher capabilities (for example Azure Blob `upload` and
`delete`). The host never branches on capability ids; it reads this metadata from the manifest.

`contract` and `code` appear on capabilities that opt into step-level schemas (transforms). When
`contract` is `"step"`, listing may omit embedded `accepts`/`returns`; full `retrieve --id` still
includes `code`.

Summaries (search results) contain `id`, `plugin`, `summary` only.

## Plugin manifest

Defined in 08 (`ecp.manifest.json`).
