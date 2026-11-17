# MVP audit fixes (2026-11-15)

An independent audit of the merged MVP (`development` @ `e37942e5`, PR #68; CLI `0.60.0`)
against `realignment/spec/` and the plan. Most of the build matches the spec. This document
lists every gap found, with evidence, the fix, the tests that prove it, and exit criteria.

**How to use this doc:** work the PR groups in order (section "Order of work"). Each finding has
an id (`F1`…`F19`). Every fix PR names the ids it closes, adds the listed tests, and ticks the
finding's checkboxes here. If a fix needs a spec change, change the spec first in the same PR.

**Branching:** the milestone is merged, so fixes branch from `development` as
`fix/mvp-audit-<slug>` and open PRs into `development` (PR group A updates the agent rules to say
this). Never push to `main` (publishes to npm).

## What the audit confirmed (no action)

- Command surface matches spec 10; MCP relay exposes exactly `retrieve`, `execute`, `commit`
  with the protocol schemas; relative paths resolve against the relay cwd.
- Error catalogue in `packages/protocol/src/errors.ts` matches spec 06 exactly.
- Host routes match spec 09 (incl. `/v1/files`); no token / bad `Host` / bad `Origin` → 401;
  no CORS headers; `/v1/file` refuses files outside the allowed set; `/` → `/app/`.
- QuickJS limits 50 ms / 32 MB; no `new Function`/`eval` in packages; trust check fully removed.
- Coverage floors 90/90/90/85; CI runs e2e and App on Ubuntu and Windows; all 12 acceptance
  files run (A10 live test skipped in CI by design, live evidence recorded).
- Secrets: `$secret` resolved via `ECP_SECRET_*`, reached the plugin, value absent from every
  file under `ECP_HOME` and from the response.

## Findings

Severity: **High** = wrong behaviour users hit; **Medium** = the build doesn't meet what the
spec/docs claim; **Low** = polish or doc drift.

### F1 — `ecp plugins` reads a different plugin list from the host (High)

**Evidence** (fresh temp `ECP_HOME`):

```sh
export ECP_HOME=<temp dir>
ecp plugins link plugins/plugin-test        # writes $ECP_HOME/plugins/package.json (correct)
ecp retrieve --type plugin --json           # host sees 1 plugin (plugin-test)
ecp plugins                                 # lists 4 linked plugins from %LOCALAPPDATA%\ecp
```

**Root cause:** `packages/cli/src/hooks/init.ts` redefines oclif `config.dataDir` to
`$ECP_HOME/plugins` in the `init` hook, but oclif has already loaded user and linked plugins
from its default data dir (`%LOCALAPPDATA%\ecp` on Windows, `~/.local/share/ecp` on Linux,
`~/Library/Application Support/ecp` on macOS) before hooks run. Writes go to the new dir;
reads/listing use the old one. Side effect: every CLI start also loads the stale linked ECP
plugins as oclif plugins (startup cost, see F6).

**Fix:**

- Make oclif's data dir correct **before** oclif loads plugins. Options, in order of
  preference: (a) set `ECP_DATA_DIR`-equivalent that oclif honours natively (oclif reads
  `<BIN>_DATA_DIR`, i.e. `ECP_DATA_DIR`, when computing `dataDir`) by setting
  `process.env.ECP_DATA_DIR ??= $ECP_HOME/plugins` in `bin/run.js` before `execute()`; (b)
  pass a custom `Config` with `dataDir` set. Remove the `Object.defineProperty` hack.
- ECP plugins are not oclif command plugins. Ensure linking/installing an ECP plugin doesn't
  make oclif load it as a CLI plugin on every start (e.g. plugin packages carry no `oclif`
  section and the CLI excludes them from oclif's plugin loading, or the CLI manages the ECP
  plugin list itself while delegating only install/link mechanics to `@oclif/plugin-plugins`).
- One-time migration: if the old default data dir contains ECP plugin entries and
  `$ECP_HOME/plugins` has none, print a one-line notice with the command to re-link (don't move
  files silently).

**Tests:** e2e with a temp `ECP_HOME` *and* a temp OS data dir pre-seeded with a stale link:
`ecp plugins` lists exactly the plugins the host reports (`retrieve --type plugin`); link,
unlink, install from tarball each keep the two views equal; Windows and Ubuntu.

- [x] Fixed
- [x] Tests added

### F2 — Duplicate validation issues (High)

**Evidence:** `ecp execute fixtures/manifests/invalid/<file> --validate --json` returns the same
issue (same code, path, message) more than once: `schema-env.ecp.json` (1 duplicate),
`schema-secret.ecp.json` (1), `schema-script-both.ecp.json` (4). Human output prints
`/steps/0/input/value  ECP_MANIFEST_INVALID  boolean schema is false` three times.

**Fix:** de-duplicate in the validator's issue builder (key: `code` + `path` + `message`), and
fix the cause: the same Ajv failure surfaces from several dispatch branches. Spec 03 requires
issues ordered and unique.

**Tests:** every invalid fixture validated through the engine *and* through the CLI returns no
duplicate issues (assert uniqueness in the conformance runner and the CLI sweep test, F5).

- [ ] Fixed
- [ ] Tests added

### F3 — `$env` / `$secret` in an execution gives an unhelpful message (High)

**Evidence:** `schema-env.ecp.json` → `ECP_MANIFEST_INVALID  boolean schema is false`.

**Spec 02:** a `$secret` or `$env` object anywhere in an execution is `ECP_MANIFEST_INVALID`
**with a suggestion to move it into a config object**.

**Fix:** detect `$secret`/`$env` objects explicitly (before or instead of relying on the
`false` schema) and emit one issue per occurrence: message
`"$env is not allowed in an execution; put it in a config object"` (same for `$secret`), path to
the marker, suggestion naming `ecp commit --type config` and the `config` step field.

**Tests:** fixtures for `$env` and `$secret` at top-level input, nested object, inside an array,
inside `$script.params`; exact message and suggestion asserted.

- [ ] Fixed
- [ ] Tests added

### F4 — Issues without a `path` (Medium)

**Evidence:** `schema-version.ecp.json` → `ECP_EXECUTION_LOAD` with `path` undefined (the
fixture expects `/version`).

**Fix:** every issue carries a JSON Pointer `path` (spec 03); load-layer issues use the
offending field (`/schema`, `/version`) or `""` for whole-document problems (file not found,
not JSON). Add a type-level guarantee (`path: string`, not optional) and a runtime assertion in
the issue builder.

**Tests:** conformance runner fails any issue without a string `path`.

- [ ] Fixed
- [ ] Tests added

### F5 — Invalid fixtures don't match their expected files; comparison isn't exact (Medium)

**Evidence** (CLI `--validate --json` vs `*.expected.json`, errors only):

| Fixture | Difference |
| --- | --- |
| `schema-env.ecp.json` | duplicate issue (F2) |
| `schema-secret.ecp.json` | duplicate issue (F2) |
| `schema-script-both.ecp.json` | 4 duplicates; extra `ECP_SCRIPT_INVALID /steps/0/input/text/$script` |
| `schema-maxrounds-zero.ecp.json` | extra `ECP_COMMIT_CONFLICT /steps/0/steps/0/mode` (`create` inside a loop body) |
| `schema-until.ecp.json` | extra `ECP_COMMIT_CONFLICT /steps/0/steps/0/mode` |
| `schema-version.ecp.json` | `ECP_EXECUTION_LOAD` path `undefined` vs `/version` (F4) |

Spec 12 says expected issues are compared **exactly** (code, path, severity; message
substring). The engine conformance test passes anyway, so it compares as a subset.

**Fix:**

- Make the conformance runner compare the full error set exactly (and warnings exactly when the
  expected file lists them).
- Fix the fixtures so each tests one thing: loop fixtures use `mode: "replace"` in the body
  unless they test the commit conflict; decide whether `$script` with both `source` and `path`
  should report one issue (preferred) or two, and make expected match.
- Add a **CLI conformance sweep** e2e test: run every invalid fixture through
  `ecp execute <f> --validate --json`, assert exit code 2 (3 for `ECP_PLUGINS_MISSING`) and the
  exact expected issues. This catches CLI/engine drift and F2/F4 regressions.

- [ ] Runner exact
- [ ] Fixtures corrected
- [ ] CLI sweep test added

### F6 — Warm CLI performance misses the target; budgets were loosened instead (Medium)

**Evidence** (`bench/results/2026-11-15-win32.json`, plan "Measurements"): warm
`ecp retrieve --id` median **1656 ms**, `--query` 1648 ms; in-process 2387 ms; execute echo warm
1993 ms. Plan target: warm commands **well under 1 s**. `bench/budgets.json` sets 3–8 s medians,
so CI enforces numbers several times looser than the target. Only Windows results exist (spec
12: Ubuntu and Windows); `bench/results/` is gitignored, so the evidence isn't in the repo.

**Likely causes to check first:** F1 (oclif loading stale ECP plugins at start), oclif loading
all commands eagerly (missing or stale `oclif.manifest.json` in the CLI package), heavy
top-level imports in the CLI entry (host/engine/Ajv/QuickJS imported even for HTTP-only paths).

**Fix:**

1. Fix F1 first, then profile `ecp retrieve --id` with a warm host (`ECP_TIMING=1`, plus
   `node --cpu-prof`) and record where time goes (Node start, oclif config/plugin load, command
   import, HTTP round trip).
2. Ensure the CLI ships an up-to-date `oclif.manifest.json` and that commands import the
   in-process host lazily (only when no host is running).
3. Re-run B1–B7 on Ubuntu and Windows; commit the results as `bench/baseline/<date>-<os>.json`
   (not gitignored) and update the plan's Measurements table.
4. Set budgets from the target, not from current numbers: warm `retrieve`/`execute` echo
   median ≤ 1000 ms on Ubuntu (Windows budget may be higher; record why). If the target can't
   be met after steps 1–2, record the measured floor and the reason in the plan, and change the
   target explicitly (user decision), rather than loosening budgets silently.

**Tests:** CI `bench` job enforces the new budgets on Ubuntu; A11 asserts the plan's decision
text and that every budget is ≤ the stated target or has a recorded exception.

- [ ] Profiled and causes recorded
- [ ] Fixes applied
- [ ] Ubuntu + Windows baselines committed
- [ ] Budgets set from targets; A11 updated

### F7 — Firefly plugin is a partial port, undocumented (Medium)

**Evidence:** `plugins/plugin-adobe-firefly-services/scripts/lib/generate.mjs`:
`GENERATED_FAMILIES = ["firefly", "photoshop"]` (17 capabilities); `PENDING_FAMILIES` lists
`audio-video`, `creative-production`, `express`, `illustrator`, `indesign`, `substance3d`, with
the comment that they "generate cleanly but are not shipped yet". `openapi/overlays` is
schema-fix overlay data (`schema-fixes.json`), not a family; `content-tagging` is
intentionally skipped (`SKIPPED_FAMILIES`: no Firefly Services OpenAPI published). Spec 08
says **all** generated capabilities; Phase 8 is marked done; the plugin README and the plan
retrospective don't mention the cut.

**Root cause:** per the comment in
`plugins/plugin-adobe-firefly-services/scripts/lib/generate.mjs`, all 63 capabilities overflow
Ajv's call stack because the host compiles **one** combined execution schema
(`packages/engine/src/validate/validate.ts` ≈ line 68,
`this.documentValidator = this.ajv.compile(schema)`). Spec 03 ("Performance rule") requires
one base validator plus per-capability input validators compiled lazily. So the real fix for
F7 is first to make validation follow spec 03 (base structure validator without inlined
capability inputs + lazy per-capability validators), then ship the pending families.

**Spike (2026-11-15):** [`realignment/spikes/schema-scale/`](spikes/schema-scale/README.md)
measured the options with Firefly-sized synthetic capabilities. The combined schema took 3.2 s
and 320 MB at 17 capabilities, 13.7 s and 1.2 GB at 63, and 52 s and 2.6 GB at 200
(superlinear; it can't scale). Per-plugin schemas with lazy loading start in 45 ms at 5,000
capabilities. Marker wrapping is the dominant cost: 13x compile time and 11x schema size per
capability. Validating against the raw `accepts` schema and dropping only the errors that marker
positions explain passed all 8 correctness cases at about 7-16 ms per capability.

**Design for validation at scale (amends spec 03 and 08; the target is thousands of
capabilities):**

1. **Each plugin builds its own schema document.** `ecp-plugin-manifest` also emits
   `ecp.schema.json` (draft 2020-12) with `$id: ecp://plugins/<plugin-id>/<version>/schema.json`
   and `$defs` per capability (`<name>.accepts`, `<name>.returns`) plus `$defs.config`. The
   schemas are **raw** (no marker wrapping). Shared shapes (file references, anything common)
   are referenced by absolute `$id` from schemas shipped in `protocol`
   (`ecp://protocol/<name>.schema.json`), never copied. Each plugin schema document validates
   on its own (plugin CI compiles it and checks its examples).
2. **The host compiles one small base validator** for execution structure only (nodes,
   markers' own syntax, ids, `uses` as a string). It never inlines capability inputs and never
   enumerates capability ids (unknown capabilities are an engine check with suggestions).
3. **Plugin schemas load lazily.** At start the host registers nothing per plugin (the
   registry already comes from manifests). On the first use of a capability, the host adds that
   plugin's schema document to Ajv and compiles that capability's `accepts` validator; validators
   are cached per plugin version. Host start is independent of the number of capabilities.
4. **Markers are handled outside the schema.** The engine walks the step input, validates each
   marker's own syntax, and records marker positions (JSON Pointers). It runs the raw `accepts`
   validator and drops only errors explained by a marker: errors at or below a marker position;
   `additionalProperties` errors naming a marker key; and `anyOf`/`oneOf` failures where some
   branch's errors are all explained (matched by `schemaPath` prefix). Typing is unchanged:
   `$ref` types are still checked by the L3 data-flow pass against `returns`; `$script` is
   checked by resolving the subschema at its position and requiring that it accepts a string;
   `$expr` stays unchecked.
5. **Editor schema:** the root `execution.schema.json` stays a small dispatch table (`if uses ==
   X then input: { $ref: "plugins/<plugin>.schema.json#/$defs/<name>.editorInput" }`) using
   relative file references, with per-plugin editor files written next to it. The editor
   variant is the only place marker-wrapped schemas exist, so the host never pays for them.
   Measure editor responsiveness with 1,000+ capabilities before finalising; if it's poor, keep
   only `uses` completion and per-capability input checks in the editor.
6. **No precompiled (standalone) validators:** runtime compile of raw schemas is cheap enough,
   and standalone code adds about 46 KB per capability.
7. **Benchmark B8** (add to `bench/`): host start, first-use validation and heap with 1,000 and
   5,000 synthetic capabilities; budgets: start independent of N, first-use compile ≤ 50 ms per
   capability, cached ≤ 1 ms.

Implementation plan:
[`schema-scaling-plan.md`](schema-scaling-plan.md) (rollout S1–S6).

**Fix (default = ship):**

- **Validation first:** implement the design above (spec 03 and 08 updated first, in the same
  PR), with tests: every existing conformance fixture still produces exactly its expected
  issues; marker-filtering cases (markers at string, object, array, whole-array and inside
  `anyOf`/`oneOf` branches; real errors beside markers still reported); B8 within budget.
- **Ship:** after validation follows the design, move the pending families into
  `GENERATED_FAMILIES`, regenerate, and for each family add the generator snapshot test, the
  `useCases`/`projections` check, and mocked-fetch unit tests for one representative capability
  (happy path, error mapping, abort). Update the plugin README with the capability list per
  family.
- **Or document:** if a family is deliberately deferred after the validation fix, list it in
  spec 08, the plugin README, Phase 8 and the plan retrospective with the reason.

Progress: **S1–S5 done** (light manifests + `ecp.schema.json`, dual-path then switch-over to
base + raw accepts + marker filter, host-lifetime `HostSchemaSet` cache, lazy registry, root +
per-plugin editor schema files with stamp-based warm start, B8 schema-scale bench + budgets;
S4b: server-mode editor writes off the start path — ready before background write, atomic
files, `ecp schema` gated on HTTP `retrieve` `plugin`).
S6 Firefly family ship lands on branch `fix/mvp-audit-group-a` (63 capabilities; `content-tagging`
still skipped).

- [x] Decision recorded (validation-at-scale S1–S5; ship all vendored families that generate
  cleanly)
- [x] Families shipped (audio-video, creative-production, express, illustrator, indesign,
  substance3d + existing firefly, photoshop)

### F8 — Missing invalid fixtures from the spec 12 minimum set (Medium)

**Evidence:** `fixtures/manifests/invalid/` has 26 fixtures; spec 12's minimum list is not
covered. Missing (add one fixture + `.expected.json` each):

- `ECP_EXECUTION_LOAD`: not JSON; wrong `schema` constant (separate from wrong `version`).
- `ECP_INPUT_INVALID`: missing required property; unknown property; enum violation (only
  wrong type exists today).
- `ECP_SCRIPT_INVALID`: `$script.path` to a missing file; `$script` at an object position.
- `ECP_CONFIG_UNKNOWN`: step names a config that doesn't exist (needs a host-aware run in the
  CLI sweep).
- `ECP_REF_UNRESOLVED`: ref to a later step; ref to a parallel sibling's output (message says
  so).
- `ECP_REF_MAYBE_MISSING`: after a gated step; after a branch without default arm; after a loop
  (check which of these the existing fixture covers; add the others).
- `ECP_REF_PATH_INVALID`: wrong output path, with a "did you mean" suggestion.
- `ECP_TYPE_MISMATCH`: number into string; object into string.
- `ECP_COMMIT_CONFLICT`: `create` inside a loop body; two parallel lines writing the same key
  (one generic fixture exists today).
- `ECP_CAPABILITY_UNKNOWN` **with a suggestion**: a near-miss typo of an installed capability
  (today's fixture uses an unrelated id, so `suggestions` is empty).

- [ ] Fixtures added with exact expected files

### F9 — The A2 "all-features" fixture doesn't use all features (Medium)

**Evidence:** `fixtures/manifests/acceptance/all-features.ecp.json` uses only step, branch,
parallel, `$expr`, `$state` and `mode: "replace"`. No loop, `$ref` (with `optional`/`fallback`),
`$script` (path and source), gated step (`expr` on a step), `create`/`merge`/`append` modes,
or config on a step. Spec 12 A2 is meant to prove executor semantics end to end.

**Fix:** extend the fixture (and its `.run.json`: result, step statuses incl. `skipped`, loop
rounds, event order) to cover every feature above, using `plugin-test` capabilities
(`bounded` for `$script`, `config-echo` for config). Keep it runnable in-process and warm.

- [ ] Fixture extended
- [ ] A2 passes on Ubuntu and Windows

### F10 — Acceptance A11/A12 are presence checks only (Low)

**Evidence:** A11 checks that the plan mentions the decision and that `bench/budgets.json`
parses; A12 checks that `legacy/` is gone. Both run in a few ms. That's acceptable as gates, but
A11 doesn't check the budgets against targets (see F6).

**Fix:** A11 asserts every budget is ≤ the target or has a recorded exception in the plan (F6).
A12 also asserts no workspace file references `legacy/` paths.

- [ ] Updated

### F11 — Agent rules and docs still describe an unmerged milestone (Low, but steers agents wrong)

**Evidence:**

- `AGENTS.md` ("This branch line (`milestone/realignment` …) is executing…", "Never push to
  `main` or `development`"), `.cursor/rules/realignment-milestone.mdc` (same), `CLAUDE.md`.
- `RELEASING.md`: `milestone/realignment` — "Merge here until the milestone ships."
- `realignment/README.md`: Phase 0 status "Local check green 2026-11-14; CI not run" though CI
  is green on `development`.

**Fix:** update to the post-merge model: `development` is the integration branch; fixes and
features branch as `fix/*` / `feat/*` from `development` with PRs into `development`; `main`
publishes. Mark the milestone as merged (date, PR #68) in the plan header and
`realignment/README.md`; set Phase 0's status to Done with the CI run. Rename
`realignment-milestone.mdc` to `realignment.mdc` describing the shipped design and where the
spec lives (do not fold into `ecp-spec.mdc`). Regenerate `realignment/doc-index.md`.

- [x] Rules and docs updated

### F12 — Spec and retrospective drift not written back (Low)

**Evidence:** `test.bounded` exists in `plugin-test` but isn't in spec 08's capability list;
the retrospective's "in-process event flush" row describes a workaround (warm host for A2) that
looks obsolete (an in-process `ecp execute` wrote all 13 events in the audit, after commit
`572110aa`); the Firefly scope cut (F7) isn't in the retrospective.

**Fix:** update spec 08 (`bounded`), verify the in-process flush is fixed (test: in-process
`execute` then read `events.ndjson` immediately after exit; `run.end` present) and update the
retrospective row; add F7's outcome. Add a retrospective row for every finding here that
changes a contract.

Note (Group A): updated spec 08 (`bounded`) and the two retrospective rows (in-process event
flush; Firefly plugin scope). The in-process flush is fixed (`run-store` flushes on `run.end`),
so A2's warm-host workaround and its comment in `test/e2e/acceptance/A2.test.ts` are obsolete
and Group G should switch A2 back to in-process. Group G owns the rest of F12.

- [ ] Spec and retrospective updated

### F13 — CLI help text isn't model-legible (Low)

**Evidence:** `ecp --help` shows topic descriptions copied from one subcommand (`host` → "Tail
host or supervisor logs.", `plugins` → "List installed plugins."); most flags have no
description (`ecp execute --help`: `--cancel`, `--json`, `--no-wait`, `--out`, `--resume`,
`--start-host`, `--validate`; `ecp retrieve --help`: `--format`, `--id`, `--limit`, `--query`,
…; `ecp app --help`: all flags).

**Fix:** set explicit topic descriptions in the CLI's oclif config; give every flag a one-line
description and examples on each command (the plan's "help written for a model reader").

**Tests:** a unit test walks the oclif manifest and fails on any command, topic or flag without
a description.

- [ ] Fixed
- [ ] Test added

### F14 — `--json` envelope not used everywhere (Low)

**Evidence:** `ecp host status --json` prints `{ supervisor, health, port, home }`, not
`{ ok: true, data }`. Spec 10: `--json` prints the envelope on every command.

**Fix:** audit every command's `--json` (host start/stop/status/restart/logs, app, schema,
secrets list, plugins list) and wrap in the envelope; errors as `{ ok: false, error }`.

**Tests:** e2e iterates all commands with `--json` and asserts the envelope shape.

- [ ] Fixed
- [ ] Test added

### F15 — `ecp retrieve` human output isn't a table (Low)

**Evidence:** `ecp retrieve --type capability --query echo` prints bare ids. Spec 10: lists as an
aligned table (id, summary, and for runs status/time).

**Fix:** aligned columns per type (capability: id, summary; execution: id, version, updated;
config: id, plugin, version; run: id, status, started, duration; plugin: package, version,
source, manifest; formatter: id, media type, default). Respect non-TTY/`NO_COLOR`.

**Tests:** snapshot tests per type.

- [ ] Fixed

### F16 — `ecp plugins` lacks manifest status; extra oclif commands undocumented (Low)

**Evidence:** spec 10: `list` adds manifest status per plugin — not shown. `ecp plugins` also
exposes oclif's `inspect` and `reset`, which aren't in spec 10's table.

**Fix:** add a manifest column (`ok` / issue summary) to `ecp plugins` (after F1, from the
host's view). Decide on `inspect`/`reset`: keep and document in spec 10 (default), or hide.

- [x] Fixed
- [x] Spec 10 updated

### F17 — In-process runs record `host.pid: 0` (Low)

**Evidence:** `run.json` of an in-process `ecp execute` has `"host": { "pid": 0, … }`.

**Fix:** record the actual process pid and a `mode: "in-process" | "server"` field (add to the
run record schema in `protocol` and spec 05).

- [ ] Fixed

### F18 — MCP relay error text repeats the first issue (Low)

**Evidence:** relay `execute { mode: "validate" }` on `ref-unresolved.ecp.json` returns text
whose first line is the top-level error (`ECP_MANIFEST_INVALID — state.later is not produced…`)
followed by the same issue (`ECP_REF_UNRESOLVED — …`).

**Fix:** first line = top-level code + a summary ("1 validation error"), then one line per
issue. Update the description snapshot/format tests.

- [ ] Fixed

### F19 — Verify A8 "runs list replays" is really asserted (Low)

**Evidence:** the Playwright run lists 7 tests (unauthorized, home/open by path, validation
fix hot reload, invalid JSON, `$script.path`, run live statuses, open by id). The A8 gate test
only checks that the spec file body contains the phrase "runs list replays".

**Fix:** confirm an assertion exists that selecting a past run replays statuses on the graph;
if not, add a dedicated Playwright test. Change the A8 gate to check test titles, not body
text.

- [ ] Verified or added

### F20 — Flaky drain test in the coverage gate (Medium, blocks commits)

**Evidence:** `pnpm run test:coverage` (the pre-commit gate) failed once during the audit:
`packages/host/test/http.test.ts > HttpApiEndpoint > drains active delay runs, rejects new
execute, and allows retrieve` → `expected true to be false` at `expect(blocked.ok).toBe(false)`.
The same file passes 3/3 when run alone.

**Root cause (likely):** the test starts a `test.delay` run of 400 ms, sleeps a fixed 50 ms, then
drains and expects a new `execute` to be refused. Under full-suite load the 400 ms run can finish
before the blocked request is sent, so the host is no longer draining and the request succeeds.

**Fix:** make the test deterministic: hold the run open until the test releases it (for example a
`plugin-test` capability or test hook that waits on a signal, or a much longer delay combined
with polling `/v1/health` until `status: "draining"` before sending the blocked `execute`).
No fixed sleeps for ordering.

**Tests:** run the file 50 times in a loop under parallel load (CI job or local script) with zero
failures.

**More evidence (2026-11-16, F7 work):** done so far: the drain test is deterministic (polls health
for `draining`), and the conformance, Azure smoke, host shutdown and scale-equivalence tests got
sized timeouts. Still flaky in the pre-commit coverage run, passing alone and in two full runs:
`packages/engine/test/operations.test.ts` "covers retrieve and execute edge paths" and
`packages/host/test/editor-schema-async.test.ts` "marks server ready before a slow editor write
finishes" (timing-based by design; make it signal-based). Both failed together once, then passed on
retry.

**More evidence (2026-11-16, group B commits):** the same load-sensitive pattern failed other tests in
the pre-commit coverage gate, each passing when run alone: `plugins/plugin-azure-blob-storage/test/smoke.test.ts`
"loads every handler through its lazy thunk" (~15 s), `packages/host/test/http.test.ts` "shuts down via admin
route without exiting the test process" (5 s timeout), and `packages/engine/test/conformance.test.ts` "accepts
every valid fixture" (5 s timeout; slow because every validation recompiles the combined schema, F7). The machine
was also running 68 leaked host processes (F22). Fix F22 first, then make these tests independent of wall-clock
timing (raise per-test timeouts where the work is inherently slow, replace fixed sleeps with readiness polling),
and re-check after S3 removes the per-call schema compile.

- [ ] Fixed. Progress after F22: `packages/host/test/editor-schema-async.test.ts` "marks server ready before a slow
  editor write finishes" is signal-based via `holdEditorSchemaWriteForTests` / `releaseEditorSchemaWriteForTests`,
  not wall-clock. Re-checked under `pnpm run test:coverage` after F22 (640 passed): `packages/host/test/http.test.ts`
  drain polling — pass; `packages/engine/test/operations.test.ts` "covers retrieve and execute edge paths" — pass;
  `packages/host/test/editor-schema-async.test.ts` — pass.

### F22 — Tests leak supervisor and host processes (High; causes F20 flakiness)

**Evidence:** on 2026-11-16 the audit machine had **34 `packages/host/dist/supervisor.js` and 34
`packages/host/dist/main.js` processes** running, started by test runs on Nov 14, Nov 15 and Nov 16 (none was the
user's real host; `~/.ecp/host.json` didn't exist). They kept running after their tests ended and their temp
`ECP_HOME`s were gone, competing for CPU and memory and making timing-sensitive tests fail (F20).

**Likely causes to check:** e2e/integration teardown that deletes the temp `ECP_HOME` (or only kills the CLI)
without calling `ecp host stop`; Windows not terminating a detached supervisor's child when the parent is killed;
supervisors that never notice their home disappeared; failed or interrupted test runs skipping `afterAll`.

**Fix:**

- Every test that starts a supervisor or host registers a teardown that stops it via the control port (and as a
  fallback kills both pids from `host.json`), before removing the temp home. Put this in the shared e2e/integration
  helpers so no test can forget it.
- The supervisor exits on its own when its `host.json` or `ECP_HOME` disappears, or when its token no longer
  matches `host.json` (orphan safety net, also useful for users).
- On Windows, kill the host when the supervisor exits (track the child; `taskkill /T` fallback).
- A global vitest teardown (e2e project) that fails the run if any process started from this repo's
  `packages/host/dist` is still alive afterwards, and kills it.

**Tests:** run the full e2e suite twice in a row; afterwards zero `packages/host/dist` processes remain (the global
teardown enforces it). Supervisor unit/e2e: deleting `ECP_HOME` stops it within a few seconds.

**Cleanup done during the audit:** the 68 leaked processes were stopped manually on 2026-11-16.

**Clean runs leak too (2026-11-16, F7 work):** a full e2e run that passed (17 files) left 5 supervisor/host
pairs running, all started during that run; they were stopped manually. So this isn't only interrupted runs.

- [x] Fixed. Cause: five e2e tests made an MCP tool call, which auto-starts a detached host, and only closed the
  relay. Fix: shared stop helper, supervisor and host orphan safety nets, and a registry-only global teardown.
  Evidence (2026-11-16, Windows): from zero leftover processes, two consecutive full e2e runs (18 files, 44 passed
  each) left **0** `supervisor.js`/`main.js` processes; before the fix one clean run left 5 pairs.

### F21 — Line endings flip on every Windows test run (Low; fixed in group A)

**Evidence:** after any `pnpm run test:coverage` on Windows, `git status` showed
`packages/mcp-relay/test/__snapshots__/descriptions.test.ts.snap` and
`plugins/plugin-adobe-firefly-services/test/__snapshots__/generator.test.ts.snap` as modified
with no content change, and every `git add` warned "LF will be replaced by CRLF". The repo had no
`.gitattributes`; the machine's system Git config sets `core.autocrlf=true`, so 608 text files
were checked out as CRLF while Vitest writes snapshots as LF. Separately,
`.ecp/default-ecp-memory.sqlite` was tracked even though `.ecp/` is gitignored (a legacy
leftover nothing references).

**Fix (done, commit "chore: pin LF line endings and untrack a stray binary"):** `.gitattributes`
with `* text=auto eol=lf` (LF in the repo and in every working tree, overriding
`core.autocrlf`), CRLF for `*.cmd`/`*.bat`/`*.ps1` (`packages/cli/bin/run.cmd`), `binary` for
images, PSD, sqlite, wasm and archives; working tree renormalised; the sqlite file untracked.
Verified: a full pre-commit test run leaves `git status` clean.

**Follow-up for contributors:** existing clones pick this up on their next checkout of changed
files; to refresh everything at once on a clean tree run
`git rm --cached -r . && git reset --hard`.

- [x] Fixed

### Environment note (not a code change)

The audit machine has stale linked ECP plugins in oclif's default data dir
(`%LOCALAPPDATA%\ecp\package.json`) and in `~/.ecp/plugins/package.json`. After F1 ships,
re-link the local plugins once against `~/.ecp/plugins` and remove the stale entries from
`%LOCALAPPDATA%\ecp` (or run `ecp plugins reset` under the old data dir).

## Working method: delegating fix groups to Cursor Agent CLI

Fix groups can be delegated to Cursor's headless agent, with a planning pass first and a
reviewer between planning and execution. Used for group A on 2026-11-15.

**Setup (once per machine):** install with Cursor's script (Windows PowerShell:
`irm 'https://cursor.com/install?win32=true' | iex`; it installs to
`%LOCALAPPDATA%\cursor-agent`, adds it to the user `PATH`, and provides `agent` and
`cursor-agent`), then `cursor-agent login` (browser sign-in) or set `CURSOR_API_KEY`. Usage counts
against the Cursor plan of the signed-in account.

**Loop per group:**

1. **Brief:** write the instructions to a Markdown file (scope = the group's findings, files to
   read, what not to touch, required output).
2. **Plan (read-only):**
   `cursor-agent -p --plan --trust --add-dir <brief folder> --output-format json "Read the planning brief at <file> and follow it exactly."`
3. **Retrieve the plan:** headless plan mode doesn't save a plan file; resume the session
   (`--resume <session_id from the JSON>`, still `--plan`) and ask it to print the full plan as
   Markdown in its answer.
4. **Review:** check every factual claim against the repo; write corrections into the execute
   brief (corrections override the plan).
5. **Execute** on a fresh branch (`fix/mvp-audit-<group>`):
   `cursor-agent -p --force --trust --add-dir <brief folder> --output-format json "Read the implementation brief at <file> and carry it out exactly."`
   The brief forbids git commits, pushes and branch changes; the reviewer commits.
6. **Verify:** read the diff (scope check: nothing outside the group), run lint and the group's
   tests, re-run the audit repro commands, tick the checkboxes here, commit with the hook on.

**Pitfalls seen and how to avoid them:**

- **Multi-line prompts get cut off on Windows:** `cursor-agent.cmd` is a batch file, and
  batch files drop everything after the first newline in an argument. Always pass a one-line
  prompt that points to a brief file.
- **Plan mode returns no plan text** (see step 3).
- **Never skip hooks:** commit with the pre-commit hook enabled; if a test fails, diagnose it
  (F20 is the known flaky one) instead of using `--no-verify`.
- **Don't test against the real `ECP_HOME`:** set a temp `ECP_HOME` in every shell that runs
  `ecp`; a forgotten export starts a real host in `~/.ecp`. The OS keychain is shared across
  homes, so use `ECP_SECRET_<KEY>` env values for secret tests.

## Order of work (PR groups)

| Group | Findings | Why this order |
| --- | --- | --- |
| A | F11, F12 (docs part) | Fix the steering first so agents branch and target correctly |
| B | F1, F16 | Correct plugin state before measuring or polishing the CLI |
| C | F2, F3, F4, F5, F8, F9 | Validation output and fixtures (the fix loop); adds the CLI sweep test |
| D | F13, F14, F15, F17, F18, F20, F22 | CLI and relay polish; stop test process leaks (F22) first, then deterministic timing tests (F20) |
| E | F6, F10 | Performance after B removes the plugin-load overhead |
| F | F7 | Validation at scale (per-plugin schemas, lazy compile, marker filtering; spec 03/08 amended), then the pending Firefly families. Can run in parallel with C–E |
| G | F12 (retrospective), F19, doc index | Close-out |

## Exit criteria

- [ ] Every finding's checkboxes ticked, with PR links next to them.
- [ ] `pnpm run check` green; CI green on Ubuntu and Windows.
- [ ] The audit repro commands in this doc produce the expected results.
- [ ] Plan retrospective and `realignment/README.md` updated.
