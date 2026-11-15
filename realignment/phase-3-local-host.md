# Phase 3 — Local services and the in-process host

**Goal:** `createLocalHost({ mode: "in-process" })` works end to end on a real `ECP_HOME`:
storage, secrets, formatters, config objects, runs on disk, schema file for editors — the
complete MVP behaviour without HTTP.

**Depends on:** Phases 1 and 2. **Spec:** 05, 06, 07, 03 (editor schema), 04 (persistence).

## Tasks

1. **`LocalStorage`** (`local`): layout and file formats of 05; atomic writes with Windows rename retry; lock files with stale detection; `ifVersion` checks; executions + meta; configs; `RunStore` (run.json, manifest copy, state.json, step files keyed `<nodeId>#<round>`, events.ndjson append with fsync per event batch of ≤50 ms); `watch` (fs.watch + poll fallback); `readExecutionFile` / `readTextFile` with size limits (2 MB executions, 1 MB scripts).
2. **`LocalSecrets`** (`local`): `@napi-rs/keyring` with the naming rules; env fallback `ECP_SECRET_<KEY>`; `list` with sources; key validation.
3. **`formatters`:** `JsonFormatter` (pretty, 2 spaces, stable key order for objects from storage), `ToonFormatter` (`@toon-format/toon`); ids per 07.
4. **`host` package, in-process part:** `createLocalHost` composition (07), `HostSettings` defaults, startup sequence (interrupted-run marking, registry, schema generation and write to `$ECP_HOME/schema/execution.schema.json`), `output.path` writer, `Operations` facade, timing breakdown.
5. **Config flows:** `commit` for configs (validation against plugin config schema with `$secret`/`$env` as strings), default-config lookup, resolution at call time (04), `ECP_SECRET_MISSING` message with the `ecp secrets set` command.
6. **Integration test harness** (`packages/host/test/integration/support`): temp `ECP_HOME`, `extraPlugins` pointing at the built `plugin-test`, helpers to run operations and read run files.

## Tests (integration unless noted)

- Storage (unit + integration): create/update/delete with versions; conflict; concurrent writers from two host instances on the same home (lock correctness); crash-safe write (kill between tmp and rename leaves the old file); watch events; poll fallback; Windows rename retry (simulated `EPERM`).
- Secrets: keychain round trip (skipped where no keychain service, e.g. headless Linux without Secret Service, with a clear skip reason); env fallback and precedence; invalid keys.
- Operations: every spec 06 path — retrieve each type (id/query/list/limit/include/format/output), execute run/validate/wait false/output path/resume/cancel/id+patch/path, commit create/update/patch/delete/conflicts/read-only types.
- Redaction (A4 subset): secret never appears in any file under `ECP_HOME`, in responses, or in the host log.
- Startup: leftover `running` runs become `interrupted` with an event; schema file written and `schemaHash` stable across restarts with the same plugins.

## Exit criteria

- [x] All operations work in-process on disk; integration suite green on Ubuntu and Windows.
  Evidence: `packages/host/test/integration/ops.test.ts` and acceptance suite; `pnpm exec vitest run --project integration`.
- [x] Acceptance A2, A3 (CLI-free variant), A4, A5, A7 pass as integration tests.
  Evidence: `packages/host/test/integration/acceptance.test.ts`.
- [x] Coverage floors met for `local`, `formatters`, `host` (in-process part).
  Evidence: `vitest.config.mts` includes those packages; `pnpm run test:coverage` green.
