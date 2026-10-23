# Phase 4 — Workflow files and observability

> Status: Planned · Branch: `feat/phase-4-workflow-files` · Depends on: Phase 3 ·
> Plan: §4.3, §4.4, §4.6

## Starting point after Phase 3

There are no hand-written oclif command classes. `packages/plugin-sdk` exists.
`plugins/plugin-jsonata` is the reference plugin (`@executioncontrolprotocol/plugin-jsonata`).
`globalRegistry` is gone; `register*` helpers require an explicit `Registry`. `ecp run` still
takes `--env <module>` until this phase. The CLI is oclif 5 with generated `COMMANDS`, bundled
plugin-plugins, and hooks (`init-host`, not-found, trust, JIT). JIT `mcp` / `plugin-app`
entries are still omitted. `ecp.invoke` is fluent (`.with(input).process()`).

## Goal

Make one `*.ecp.ts` file run a whole workflow: bindings, policies and plugin needs included.
Make every run legible to the supervising agent through a run journal, live events, stable
error codes and resume-from-step. This is the phase that makes the self-healing loop real.

## Scope

**In:**

- `workflow(...).with([...])` and `.requires()`.
- The workflow file loader, dependency inference and the missing-plugin flow.
- Environment layering, user and team environment files, config validation.
- The run journal, `--events`, error codes and exit codes.
- `ecp run --to`, `ecp runs list|show|resume|rerun` (replacing `ecp test` and `test-session`),
  `ecp install`, `ecp init`.
- Converting the examples.

**Out:**

- Publishing (Phase 5).
- `--on-failure` and scheduling (Later).

## Tasks

### 1. Fluent API additions (core)

```ts
workflow(label).with(bindings: Array<ExtensionBindingBuilder | PolicyBindingBuilder>)
extension(id, label?).requires(range: string, pkg?: string)
policy(id, label?).requires(range: string, pkg?: string)
```

- `.with()` can be called once. Order inside the array doesn't matter.
- `WorkflowBuilder.compile()` keeps returning today's `WorkflowManifest`, unchanged. A new
  `WorkflowBuilder.requirements()` returns the requirements block.
- **Requirements block:** new schema `@executioncontrolprotocol.requirements` v1.0, generated
  to JSON Schema with the others. Each entry has:
  - `kind`: `extension` or `policy`
  - `id`
  - `package`: inferred or explicit
  - `range`: optional
  - `config`: with `$secret` and `$env` placeholders, never values
  - `source`: `explicit` (from `.with()`) or `inferred` (from a step)

### 2. Workflow file loader (`@executioncontrolprotocol/node`)

- Bundle the file with esbuild, reusing the existing `ecp-absolute-externals` plugin:
  - `@executioncontrolprotocol/core` and `@executioncontrolprotocol/core/types` resolve to the
    CLI's own installed copy.
  - Relative imports are bundled.
  - Any other bare import fails with `ECP_WORKFLOW_LOAD`: "workflow files may only import
    @executioncontrolprotocol/core and relative files".
- The default export must be a `WorkflowBuilder`, otherwise `ECP_WORKFLOW_LOAD`.
- Plain `.json` manifests still load (no bindings; requirements inferred from steps).

### 3. Dependency inference

1. Collect ids:
   - From steps: the capability id up to the last `.` gives the extension id.
   - From `.with()` extension and policy bindings.
   - From flow nodes inside `parallel`, `branch` and `loop`.
2. Map each id to a package. `.requires(range, pkg)` wins; otherwise `@scope/<name>` →
   `@scope/plugin-<name>`. Built-ins resolve to nothing to install: core's `registry-control`,
   and the environment packages.
3. Compare with installed plugins: each installed plugin's package name and `ecp.extension`
   definition id, from the host built in Phase 3.
4. Version check: an installed plugin outside a pinned range counts as missing, with reason
   `version`.

### 4. Missing-plugin flow (`ecp run`, `ecp validate`, `ecp install`)

- **Interactive terminal:** one prompt per package (`Install @executioncontrolprotocol/plugin-image-sharp@^1? (Y/n)`),
  then `plugins:install`, then rebuild the host and continue.
- **`--yes`:** install without asking. The trust hook still applies.
- **`--json` or non-interactive:** stop with `ECP_PLUGINS_MISSING`, exit `3`, and
  `details: [{ id, package, range, reason: "missing" | "version", command }]`.
- **`ecp install <file>`** installs everything without running.
- **`ecp validate`** never installs; it only reports.

### 5. Environment layering

The effective environment is built in this order:

1. The built-in Node environment (binds `secrets`, `process-env`, `registry-control`).
2. The user default `<configDir>/environment.ecp.ts` if it exists, **or** the `--env <file>`
   given on the command line. Either one default-exports `environment(id).with([...])`.
3. The workflow's `.with([...])`.

Merge rules (§4.4):

- **Extensions merge by id.** Later layers merge their config over earlier ones (shallow
  merge, per top-level key).
- **Policies are additive.** All bound policies run; a deny or pause from any of them wins. A
  workflow can't remove an environment policy.
- **Secrets providers are environment-only.** An extension whose definition registers a config
  resolver (it handles `environment:configuring` to register one) may not appear in a
  workflow's `.with()`. If it does, that's `ECP_BINDING_INVALID`. Add a `providesConfigResolver`
  flag to `defineExtension` so validation doesn't have to guess.
- **Compatibility:** every extension the workflow uses must `.supports()` the environment
  (Phase 2), otherwise `ECP_ENVIRONMENT_UNSUPPORTED`.

### 6. Config validation (fixes a gap in today's code)

- Definitions declare `withConfig(zod)`, but bound config is never checked against it today.
- Validate every binding's config against its definition's schema at load time:
  - **Before secrets are resolved:** `$secret` and `$env` placeholders satisfy any string field.
  - **After resolution:** validate again with the real values.
- A failure is `ECP_BINDING_INVALID` with the binding id and the zod path.

### 7. Run journal

Written for every `ecp run` (and every generated capability command), under
`.ecp/runs/<runId>/` in the current directory. `.ecp/` is gitignored since Phase 1.

```text
.ecp/runs/<runId>/
  run.json          journalVersion, runId, workflow file path + content hash, environment id,
                    plugin versions, input (redacted), status, startedAt/endedAt, error
  steps/<stepId>.json
                    stepId, capabilityId, input after ref resolution (redacted), output,
                    policy decisions (policy id, event, decision, reason), staged mutations,
                    committed state after the step, attempts, timing, error
```

- The writer is a built-in host hook on the public lifecycle events (`run:before` …
  `run:finally`, `step:before` … `step:finally`).
- **Redaction:** the config resolver records every resolved secret value, and the journal
  replaces those values with `"[secret:<key>]"` wherever they appear.
- `journalVersion: 1`. The format is a contract: it's the start of the compilation corpus (§8.2).
  Breaking changes bump the version.

### 8. Live events

`ecp run --events` streams NDJSON to stdout, one object per lifecycle event:

```json
{"type":"step.end","runId":"…","stepId":"web","status":"completed","durationMs":412,"ts":"…"}
```

- **Types:** `run.start`, `step.start`, `step.policy`, `step.end`, `step.error`, `run.end`.
- With `--events`, the final result goes to the last line as `run.end`.
- The App and MCP progress notifications reuse this stream.

### 9. Error codes and exit codes

Add `core/src/types/errors.ts` with the `ECP_*` catalogue from §4.6, mapped from today's codes:

| Today | New |
| --- | --- |
| `UNKNOWN_CAPABILITY`, `CAPABILITY_NOT_FOUND` | `ECP_CAPABILITY_UNKNOWN` |
| `INVOKE_INPUT_INVALID` | `ECP_INPUT_INVALID` |
| `INVOKE_OUTPUT_INVALID` | `ECP_OUTPUT_INVALID` |
| `STEP_FAILED`, `INVOKE_FAILED` | `ECP_STEP_FAILED` (original message kept) |
| `POLICY_DENIED`, `INVOKE_DENIED` | `ECP_POLICY_DENIED` (names the policy) |
| `UNSUPPORTED_RUNTIME_EXTENSION` | `ECP_ENVIRONMENT_UNSUPPORTED` |
| `REGISTRY_REGISTRATION_DENIED` | `ECP_PLUGIN_DENIED` |
| Patch codes (`PATCH_*`, `DUPLICATE_STEP_ID`) | Unchanged |

New codes:

- `ECP_WORKFLOW_LOAD`
- `ECP_PLUGINS_MISSING`
- `ECP_REF_UNRESOLVED`
- `ECP_BINDING_INVALID`
- `ECP_SECRET_MISSING`
- `ECP_RUN_PAUSED`
- `ECP_RERUN_INCOMPATIBLE`

Every error keeps the `code`, `message`, `path`, `suggestions` and `severity` shape. Exit codes
follow §4.6.

### 10. Stepping, resuming and re-running (`ecp run --to`, `ecp runs`)

Today `ecp test start|run|rerun|status` and `core/src/test-session` let you:

- Run a workflow up to a step and stop.
- Continue from where it stopped.
- Re-run exactly one step.
- Inspect the saved state.

None of that is dropped. It moves onto the run journal, so every run (not just test sessions)
can be stepped, resumed and re-run.

| Today | After Phase 4 |
| --- | --- |
| `ecp test start <workflow>` + `ecp test run --to <step>` | `ecp run <file> --to <step>`: runs through that step, then stops with status `stopped` and a cursor |
| `ecp test run --to <later step>` (continue) | `ecp runs resume <id> [--to <step>]`: continues from the cursor with the journal's committed state |
| `ecp test rerun <step>` | `ecp runs rerun <id> --from <step> --to <step>`: re-runs exactly that step and clears what came after it |
| — | `ecp runs rerun <id> --from <step>`: re-runs from a step to the end |
| `ecp test status` | `ecp runs show <id>`: status, cursor, per-step records |
| — (not possible today) | `ecp runs resume <id> --approve`: continues a run that a policy paused |

**Commands:**

- **`runs list`:** newest first, filter by `--status` and `--workflow`, `--json`.
- **`runs show <id>`:** the journal, with `--step <id>` for one step. Shows the cursor for
  stopped and paused runs.
- **`runs resume <id> [--to <step>] [--approve]`:**
  - Works on runs with status `stopped` or `paused`.
  - Continues from the cursor with the committed state recorded after the last completed
    step, using the current workflow file.
  - **Approvals:** with `--approve`, the journal records `{ stepId, approvedBy, at }`, and the
    policy context exposes recorded approvals, so `plugin-approval` allows the step it paused
    on. Without `--approve`, resuming a paused run pauses again at the same step.
  - `--to` stops again at a later step.
- **`runs rerun <id> [--from <step>] [--to <step>]`:**
  - Re-runs using the **current** workflow file, which is the point: fix, then rerun.
  - Steps before `--from` are restored from the journal: their outputs and the committed state
    after the last restored step.
  - The default `--from` is the first failed step. The default `--to` is the end.
  - Steps after `--to` keep no outputs: their history and `.as` keys are cleared, as
    `test rerun` does today.
- **Each resume or rerun is a new run** with its own id, linked to its parent
  (`parentRunId`, `resumedFrom`) in `run.json`. Journals are append-only.

**Safety:**

- For both `resume` and `rerun`, if any restored step's definition changed (its hash differs
  from the journal), stop with `ECP_RERUN_INCOMPATIBLE`. The error suggests a full run or an
  earlier `--from`.
- Restored state comes only from the journal, never from a hand-edited file, so the policy
  record stays trustworthy.

**Implementation:**

- Port the executor's single-step (`onlyStepId`) and stop-after (`runTo`) support that
  `test-session` uses today.
- Add resume-from-cursor with injected committed state.
- Add the `stopped` status (today a run that stops early reports `paused`, which is ambiguous
  with a policy pause).
- Then delete `core/src/test-session`, `runtime/test-session-state.ts`, the `test-session`
  types, the `ecp test` commands and `src/lib/test-session-io.ts`.

### 11. `ecp init` and examples

- `ecp init [name]` writes `<name>.ecp.ts` with one `jsonata.transform` step and comments
  pointing to `ecp search` and the docs.
- Convert every surviving example to a single `*.ecp.ts` file (§5.5), and delete their
  `environment.ts` files:
  - `01-echo`, `02-weekly-brief` (input-driven), `03-secrets-bind`, `06-invoke`,
    `07-accepts-returns`, `create-then-summarize-ollama`, `ollama-filesystem-documents`,
    `ollama-mcp-tools`.
  - The vendor examples move next to their plugins in Phase 5.

## Tests and verification

- **Unit:**
  - `.with()` and `.requires()` builders.
  - The requirements block and its JSON Schema.
  - Inference across flow nodes.
  - Id-to-package mapping, including explicit packages.
  - Merge rules (config override, additive policies, secrets-provider rejection).
  - Config validation with placeholders.
  - Redaction.
  - Error-code mapping.
- **Integration** (hermetic data directory):
  - A workflow with a missing plugin: the prompt path (simulated TTY), `--yes`, and `--json`
    (`ECP_PLUGINS_MISSING`, exit `3`).
  - A failing step writes a journal with the error; after fixing the file,
    `runs rerun --from` completes and reuses earlier outputs.
  - `ecp run --to <step>` stops with status `stopped`; `runs resume` finishes it; the result
    matches a straight run.
  - `runs rerun --from X --to X` re-runs exactly one step and clears later outputs.
  - An approval pause: `runs resume` without `--approve` pauses again; with `--approve` it
    continues, and the approval is in the journal.
  - Each `ecp test` scenario from today's tests passes through the new commands before the old
    ones are deleted.
  - Changing an earlier step's definition gives `ECP_RERUN_INCOMPATIBLE`.
  - `--events` emits valid NDJSON in order.
  - A workflow binding `secrets` gives `ECP_BINDING_INVALID`.
  - A Node-only extension under the browser environment gives `ECP_ENVIRONMENT_UNSUPPORTED`.
- **Examples:** every converted example runs in CI (offline ones run for real; ones needing
  API keys run with `--dry-run`).

## Exit criteria

- [ ] On a machine without `plugin-jsonata`, `ecp run demo.ecp.ts` prompts, installs and runs;
      `--json` returns `ECP_PLUGINS_MISSING` instead.
- [ ] Every `ecp test` ability exists on the journal: `ecp run --to`, `runs resume` (including
      `--approve`), `runs rerun --from/--to`, `runs show`.
- [ ] A failed step can be fixed and resumed with `ecp runs rerun <id> --from <step>`.
- [ ] Every run writes a versioned, redacted journal; `--events` streams NDJSON.
- [ ] Bound config is validated against `withConfig` schemas.
- [ ] Examples are single files; `test-session` and `ecp test` are gone, replaced as above.
- [ ] Phase status updated in `reset/README.md` and `RESET-PLAN.md` §7.

## Risks

| Risk | Mitigation |
| --- | --- |
| Shallow config merge surprises users with nested config | Document it. Revisit deep merge only if a real plugin needs it |
| Journals grow large (images, big payloads) | Store file outputs as `FileRef`s, not inline bytes. Add `ecp runs prune --older-than` if needed |
| Resuming against an edited file produces subtly wrong state | Hash every restored step definition and refuse on mismatch (`ECP_RERUN_INCOMPATIBLE`) |
