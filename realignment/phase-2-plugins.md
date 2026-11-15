# Phase 2 — Plugin SDK, manifests and loading

**Goal:** plugin authors can write a plugin, build its `ecp.manifest.json`, and the host can
register it from the manifest and call it on first use. `plugin-test` exists and exercises every
handler-context feature.

**Depends on:** Phase 1. **Spec:** 08, 07 (`PluginAdapter`), 05 (trust, layout).

## Tasks

1. **`plugin-sdk`:** `definePlugin`, `capability`, types `Handler`, `HandlerContext`, `CapabilityInput/Output`, `PluginConfig`, `StateHandle`, `FileRef` (re-exported from `protocol`); validation of definitions (ids, keys, required metadata) at definition time with clear errors.
2. **`ecp-plugin-manifest` bin:** imports the built definition (`dist/index.js`), converts zod schemas with `z.toJSONSchema` (02/08 options), strips `$schema`, sorts keys, computes `hash`, checks `package.json` version, writes `ecp.manifest.json`. `--check` mode verifies an existing manifest matches (CI use). Exit non-zero with a precise message on any problem.
3. **`LocalPluginRegistration`** (in `local`): plugin list from `$ECP_DATA_DIR` (oclif `package.json` dependencies + link records) plus `extraPlugins`; manifest read and validation; in-memory regeneration for linked plugins; registry; per-plugin issues; lazy import on first call; handler thunk cache; `ECP_PLUGIN_LOAD_FAILED` mapping; duplicate-capability detection.
4. **Handler context implementation** (in `engine`, used by the adapter call path): `config`, `signal`, `run`, `step`, `state` snapshot (deep-frozen), `store` staging, `files.read` (file/url/artifact) and `files.writeArtifact` (via `RunStore.artifactDir`), mediated `call` (re-enters the executor's single-step path with validation and config resolution; nested event with `parentNodeId`), `logger` (to host log with run/step ids), `usage` (into the step record).
5. **`plugin-test`** with the capabilities in 08, built with the real SDK and bin; unit tests for each capability.
6. **Fixture parity:** replace the hand-written `fixtures/plugins/fixture-plugin/ecp.manifest.json` usage in integration tests with the real `plugin-test` where behaviour (not just shape) matters; keep the fixture plugin for pure engine tests.

## Tests

- SDK: invalid plugin id, invalid capability key, missing `useCases`/`projections`, non-lazy handler rejected, types infer input/output/config (type-level tests with `expectTypeOf`).
- Manifest bin: deterministic output (build twice → identical bytes), version mismatch fails, `--check` detects drift, zod optional/default/enum/union/array/record map to the expected JSON Schema.
- Loader: user plugin, linked plugin (manifest regenerated from source without importing handlers — assert with a handler module that throws on import), missing manifest, invalid manifest, version mismatch, duplicate capability id, handler import failure → `ECP_PLUGIN_LOAD_FAILED`, second call uses cache.
- Context: staged writes applied on success and discarded on failure; `signal` aborts `delay`; `files` round trip; `ctx.call` validates the nested input and fails clearly on unknown capability; usage recorded.

## Exit criteria

- [ ] `plugin-test` builds with a checked manifest; `ecp-plugin-manifest --check` runs in CI for every plugin.
- [ ] Registry built from manifests only (test proves no handler module is imported before the first call).
- [ ] Coverage floors met for `plugin-sdk`, `local` (plugin part) and `plugin-test`.
