# Phase 0 — Build spec

Turn [`REALIGNMENT-PLAN.md`](../REALIGNMENT-PLAN.md) into a spec precise enough that each
implementation phase can be planned and built without re-deciding anything. **No production
code in this phase.** Throwaway spikes and benchmarks go in `realignment/spikes/`.

## Deliverables

Each deliverable is a document in `realignment/spec/` (machine-readable schemas next to it as
`.schema.json`). Every document ends with "Decisions" (what was chosen and why) and "Open"
(anything left, with an owner).

| # | Document | Contents | Inputs |
| --- | --- | --- | --- |
| 1 | `execution-manifest.md` + `execution.schema.json` | Execution manifest v2: document shape, node types (step, parallel, branch, loop), `expr`, `$ref`, `$state`, `$expr`, `$script`, file refs, commit modes, `config` on steps, validation rules (unique ids, ref order, `maxRounds`, else arm last, boolean results in control positions) | Plan: "Execution manifest v2"; `packages/core/src/types/workflow.ts`, `schema.ts`, `validate/` |
| 2 | `executor.md` | Run semantics: sequence, parallel (concurrency limit, two branches writing the same key), branch, loop, skipped steps, step failure and run failure, retries and timeouts, cancellation, resume (what reruns), run state persistence after each step | Plan; `runtime/in-memory-executor.ts`, `resolve-input.ts`, `store.ts` |
| 3 | `objects.md` + schemas | Config object, run record, run events, capability entry, `ecp.manifest.json`, formatter entry; ids and versions | Plan: "Config and secrets", "Plugin loading"; today's run journal types |
| 4 | `operations.md` | `retrieve`, `execute`, `commit`: exact inputs, outputs, errors; `path` / `id` / inline / `id + patch`; `output.path`; `ifVersion`; patch format with step-id paths; the `ECP_*` error catalogue (carry over what fits from `packages/core/src/types/errors.ts`) | Plan: "MCP surface", "Editing saved executions"; today's patch op |
| 5 | `services.md` | `defineService` / `use` / `get` API; interface and method signatures for `PluginAdapter`, `StorageProvider`, `SecretsProvider`, `ExpressionEngine`, `Formatter`, `Endpoint`, `Auth`; id rules; single vs multiple; lookup-at-use rule | Plan: "Service model" |
| 6 | `plugins.md` | Plugin authoring API (from `defineExtension`), config schema, `ecp.manifest.json` generation and install checks, in-process loading on first call, per-capability modules | Plan: "Plugin loading"; `packages/plugin-sdk`, `plugins/*` |
| 7 | `storage.md` | `localstorage` layout: folders, file names, ids vs paths, versions, atomic writes, one file per run record, re-reading on change | Plan: "CLI", "Local mode" |
| 8 | `host-and-processes.md` | Host HTTP routes, token and `Host` check, `~/.ecp/host.json`, supervisor start/drain/restart/crash protocol, relay health wait and retry, one-off CLI host discovery | Plan: "ECP host", "Host supervisor", "MCP relay" |
| 9 | `retrieve-matching.md` | How `retrieve` queries match (substring/fuzzy in the MVP), ranking, `include` / `select` / `limit` | Plan: "retrieve" |
| 10 | `stack.md` | Confirmed dependency choices and versions (see the plan's readiness list), including the keychain library | Plan: "Implementation readiness" |
| 11 | `fixtures/` | Conformance fixtures: one valid and one invalid per manifest feature, expected validation results; v1 → v2 conversions of `examples/*` and the Firefly dogfood workflows | Deliverables 1–2 |
| 12 | `realignment/spikes/` + plan "Measurements" | Startup spike (Node + oclif start, QuickJS start, schema compile, Firefly import) and the CLI benchmark early proxy on today's CLI; budgets recorded in the plan | Plan: "Measurements" |
| 13 | `model-check.md` | JSON vs Fluent: tokens and validity rate for a frontier and a small model on the fixture tasks; decides whether the Fluent formatter is built | Plan: "Fluent as an authoring format" |

## Order

1, 2 and 3 first (everything else references them). Then 4–9 in any order. 10 alongside.
11 once 1 and 2 are stable. 12 and 13 can start immediately, in parallel.

## Exit criteria

- [ ] All documents above exist, with no "TBD" outside an explicit "Open" list.
- [ ] `execution.schema.json` validates every valid fixture and rejects every invalid one.
- [ ] The fixture suite runs on today's executor through a v1 adapter with the same state outcome (proves nothing was lost).
- [ ] Startup budgets and the benchmark proxy numbers are recorded in the plan's "Measurements".
- [ ] The plan's open questions are either answered (and the plan updated) or assigned to a later phase.
- [ ] Phase docs for phases 1–4 can be written from the spec alone.
