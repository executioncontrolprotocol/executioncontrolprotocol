# Phase 1 — Engine

**Goal:** `engine` and `quickjs` complete: service container, schema generation, all
validation layers, executor, value resolution, patches, retrieve matching — fully tested
against the fixtures with in-memory test services.

**Depends on:** Phase 0. **Spec:** 02, 03, 04, 06 (patch, matching, errors), 07 (container).

## Tasks

1. **Service container** (07): `defineService`, `createEnvironment().use().start()`, `ServiceLookup`, rules 1–4 with enforcement of lookup-too-early.
2. **Test services** (in `engine/test/support/`, exported from a `engine/testing` subpath for other packages' tests): `MemoryStorage` (StorageProvider incl. RunStore and watch), `MemorySecrets`, `FixturePluginAdapter` (reads a fixture `ecp.manifest.json` and maps capability ids to in-test handlers), `ImmediateExpressionEngine` is **not** allowed — tests use the real `quickjs` package.
3. **`quickjs` package:** `QuickJsExpressionEngine` (07): one runtime, a fresh context per evaluation, state passed as JSON and deep-frozen, interrupt handler for the 50 ms budget, memory limit, result size limit, error mapping to `ECP_EXPR_*`.
4. **Schema generation** (03): base + capability-dispatched inputs + marker dispatch + `x-ecp-returns`; full-file output for editors; per-capability input validators compiled lazily and cached by `schemaHash`.
5. **Validation:** L0 load (from object or text), L1 (Ajv, error filtering and mapping to `ValidationIssue` with JSON Pointers, `expected`, `actual`, suggestions), L2 semantics, L3 data-flow checker exactly as in 03, L4 run input with defaults. Deterministic ordering of issues.
6. **Value resolution and `$script` building** (04), with acorn syntax checks (02).
7. **Executor** (04): sequence, step (gate, resolve, config, validate, call, output validate, redact, commit), branch, loop, parallel with `maxConcurrency` and sibling abort, commit modes, staged writes, events with `seq`, step records, state persistence after each step, cancellation, interruption marking, resume from cursor, timing capture.
8. **Operations** (`engine/operations`): `retrieve`, `execute`, `commit` implementing spec 06 against the service lookup — including matching, formats via `Formatter`, `output.path` (through `StorageProvider`-independent file write helper injected by the host; in Phase 1 use a test writer), `clientRequestId` recording, patch application with `@nodeId`.
9. **Conformance runner:** `test/conformance.test.ts` loads every fixture; valid → zero errors; invalid → expected issues; run fixtures → expected status, result, step statuses, event type order.

## Tests (beyond the conformance suite)

- Container: duplicate single service; two defaults; ambiguous get; missing get message lists ids; lookup in constructor and in `start()` throws; stop order reverse.
- Validation: each L3 rule with positive/negative/edge (definite vs maybe through gate, branch with/without default, loop zero rounds, parallel isolation and conflict, `append` schema transform, `merge` schema merge, unknown-schema stop, `integer`→`number` fit, `$expr` targets unchecked, `available` lists capped at 50); suggestion distances; issue ordering; `schemaHash` changes when a capability's `accepts` changes.
- QuickJS: boolean control, non-boolean control error, value result, thrown error, infinite loop timeout, memory blow-up, huge result, no `require`/`process`/`fetch`, state mutation inside the VM does not leak.
- Executor: every run fixture plus: secret redaction in outputs/events/state/step records; parallel failure cancels siblings (statuses `cancelled`); cancel mid-step; step timeout; staged writes discarded on failure; `create` conflict at run time; resume re-runs only the in-progress node and restores loop round and branch choice.
- Patches: each op; `@nodeId` at depth; unknown id; failing `test` op; patched result validated.
- Retrieve matching: scoring, ties, zero-score drop, limit, determinism.

## Exit criteria

- [x] All conformance fixtures pass; coverage floors met for `engine` and `quickjs`.
- [x] No Node I/O imports in `engine` (ESLint rule enforcing it, as legacy core had).
- [x] Generated editor schema for the fixture plugins validates `localize-banner` and reproduces the prototype's precise errors.
- [x] Spec unchanged, or updated in the same PR with reasons.
