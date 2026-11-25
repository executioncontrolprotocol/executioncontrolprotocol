# 12 — Testing, benchmarks and MVP acceptance

## Test layers

| Layer | Location | Runs | Notes |
| --- | --- | --- | --- |
| Unit | `packages/*/test/**/*.test.ts`, `plugins/*/test/**` | `test:unit`, coverage gate | Pure, fast, no network, no real `ECP_HOME` |
| Conformance | `fixtures/` + `packages/engine/test/conformance.test.ts` | part of `test:unit` | Every fixture validated; expected issues compared exactly (code, path, severity; `messageIncludes` substring; optional `suggestionsIncludes`) |
| Integration | `packages/host/test/integration/**` | `test:integration` | `createLocalHost` in-process, temp `ECP_HOME`, `plugin-test` via `extraPlugins` |
| E2E | `test/e2e/**` (root) | `test:e2e` | Spawns the built `ecp` bin: supervisor, host, relay over stdio (MCP SDK client), plugin pack/install/link; Ubuntu + Windows. `test/e2e/cli/fixture-sweep.test.ts` (one warm host) runs every `fixtures/manifests/invalid/*.ecp.json` through CLI and MCP validate and compares the same tuples; exit code **2** for validation refusals (spec 06, including `ECP_PLUGINS_MISSING`) |
| App | `packages/app/test/e2e/**` | `test:app` | Playwright against a real host |
| Live | `plugins/*/test/live/**` | when secrets exist | Anthropic, Azure (Azurite or account), Firefly; skip cleanly otherwise |

Every behaviour change ships positive, negative and edge tests (`.cursor/rules/testing-coverage.mdc`).
Coverage floors: 90 % lines/functions/statements, 85 % branches (01).

## Fixtures (`fixtures/`)

```text
fixtures/
├── manifests/valid/*.ecp.json                 each must validate with zero errors
├── manifests/invalid/*.ecp.json               each with a sibling *.expected.json: [{ code, path, severity }]
├── manifests/runs/*.ecp.json + *.run.json     run fixtures: input, expected status, result, step statuses, events (types in order)
├── plugins/fixture-plugin/                    a tiny plugin with hand-written ecp.manifest.json for engine tests
└── v1/                                        v1 workflow copies and dogfood sources with hand-written v2 conversions (the `legacy/examples/` tree is gone)
```

Minimum fixture set (Phase 0 writes them; later phases add more):

- **Valid:** smallest execution; every node kind alone; nested branch-in-loop-in-parallel;
  every marker; every commit mode; `$script` by source and by path; `optional`/`fallback`;
  `localize-banner` (reference example, 02; validated against the shipped Firefly, Anthropic and
  test plugins in the engine tests, where its only issue is the missing `anthropic/default` config).
- **Invalid (one per code that L0–L3 can produce):** at least one fixture for each of
  `ECP_EXECUTION_LOAD`, `ECP_MANIFEST_INVALID` (unknown property, missing `steps`, duplicate
  id, default arm not last, `mode` without `as`, `$secret` in execution, `maxRounds` 0),
  `ECP_CAPABILITY_UNKNOWN` (with suggestion), `ECP_PLUGINS_MISSING`, `ECP_INPUT_INVALID` (wrong
  type, missing required, unknown property, enum), `ECP_EXPR_INVALID` (syntax, two params,
  async), `ECP_SCRIPT_INVALID` (syntax with line/col, missing file, both source and path,
  `$script` at an object position), `ECP_CONFIG_UNKNOWN`, `ECP_REF_UNRESOLVED` (unknown key,
  later step, parallel sibling), `ECP_REF_MAYBE_MISSING` (after gated step, after branch without
  default, after loop), `ECP_REF_PATH_INVALID` (with "did you mean"), `ECP_TYPE_MISMATCH`
  (number into string, object into string), `ECP_COMMIT_CONFLICT` (two `create`, `create` in
  loop, parallel lines same key), `ECP_RETURNS_UNRESOLVED`.
- **Runs:** each node kind's semantics; skip; branch none-match; loop exhausted; parallel
  failure cancels siblings; each commit mode; `$state` staged writes discarded on failure;
  config + secret resolution and redaction; output invalid; step timeout; expr timeout; resume
  after interruption.
- **v1 conversions:** `fixtures/v1/` holds the copied v1 manifests; each has a v2 conversion.
  Phase 8 checks they run on the new engine with the expected state.

## Benchmarks (`bench/`)

`bench/run.mjs` (plain Node, no extra tools), writes `bench/results/<date>-<platform()>.json`
(`win32`, `linux`), prints a table. CI and the default runner use **11** samples per scenario
(`ECP_BENCH_RUNS`; a local full run may set `20`). B6 host start/restart uses **5** samples.
B7 `ecp retrieve --type schema` uses **5** samples. Median and p95 are reported.

Design targets (median ms) live in `bench/targets.json`. Enforced budgets are in
`bench/budgets.json` (equal to the target when both OS medians are at or under the target;
otherwise an `exception` sentence in `REALIGNMENT-PLAN.md` and the measured median rounded up
to 50 ms). Committed evidence is `bench/baseline/<date>-win32.json` and
`<date>-linux.json` (not gitignored). A11 checks targets, budgets, baselines, and the plan text.

B1–B7 use a temp `ECP_HOME` with all four MVP plugins linked (`plugin-test`, Anthropic, Azure,
Firefly). B4 live Firefly is skipped when credentials are absent (null median + note; no budget
row). B5 runs `fixtures/manifests/valid/branch.ecp.json` with `--input` so the branch `$expr`
runs (not `--validate`). B7 measures editor-schema readiness with all MVP plugins present.

The MCP relay is **not** a budgeted bench mode (A9 covers parity); result JSON records a note
instead of an MCP timing column.

| # | Scenario | Budgeted modes |
| --- | --- | --- |
| B1 | `ecp retrieve --type capability --id …` | in-process, warm host via CLI |
| B2 | `ecp retrieve --type capability --query …` (all installed plugins incl. Firefly) | same |
| B3 | `ecp execute fixtures/…/echo.ecp.json` | same |
| B4 | `ecp execute` Firefly fixture ×10 in a row (plugin import + IMS token; live only) | skipped without credentials |
| B5 | `ecp execute` `$expr`-heavy fixture (`branch.ecp.json` with `--input`) | warm |
| B6 | `ecp host start` until healthy; restart until healthy | warm |
| B7 | `ecp retrieve --type schema` (editor schema readiness) with all MVP plugins | warm |
| B8 | Schema scale: host start (incl. registry load of light manifests), first-use compile, cached validate, heap at 1,000 and 5,000 synthetic capabilities; warm `ecp execute` with all real plugins | synthetic + warm |

Default `pnpm run bench` measures B8 at 1,000 synthetic capabilities. Set `ECP_BENCH_SCALE=5000`
to also run the 5,000-capability scale (kept off CI by default so the bench job stays within a
few minutes).

**Phase 0** runs the early proxies with legacy code (`legacy/` CLI cold runs, QuickJS start,
Ajv compile of Firefly-sized schemas, Firefly import time) and records them in the plan's
"Measurements". **Phase 5 (2026-11-17)** ran B1–B8 and applied the decision rule: B3 warm
savings **700 ms** median (in-process **1085.7** vs warm **386.1**) crossed the ~300 ms
threshold. **Implemented (follow-up):** one-off CLI commands auto-start a detached supervisor
unless `--no-start-host` or `ECP_NO_START_HOST`; idle shutdown after **15 minutes** with no
activity and no active runs (spec 09, 10). **B1–B3 in-process rows** set `ECP_NO_START_HOST=1`
in `bench/run.mjs` so they still measure a per-command in-process boot; warm rows are unchanged.
Budgets and baselines stay as recorded in the plan and `bench/budgets.json`.

## MVP acceptance scenarios

The MVP is done when **every** scenario passes as an automated test (E2E unless noted) on
Ubuntu and Windows CI, and A10 has been run live once with the result recorded.

| # | Scenario | Proves |
| --- | --- | --- |
| A1 | Fresh `ECP_HOME`. `ecp plugins link plugins/plugin-test`. `ecp retrieve --type capability --query echo` finds `test.echo`; `--id` returns `accepts` and `returns`. Same through an MCP client over `ecp mcp start` | Plugin loading from manifests, retrieve, relay |
| A2 | `ecp execute fixtures/manifests/acceptance/all-features.ecp.json --input @in.json` completes; result and every step status match the run fixture; `run.json`, step records, `events.ndjson` exist; the run asserts the **exact** event type sequence in `all-features.run.json` | Executor semantics end to end |
| A3 | Fix loop: for 8 broken manifests (one per L1/L2/L3 family), `ecp execute --validate --json` returns exactly the expected codes and paths with suggestions; applying the suggested fix makes each valid. Same via MCP `execute { mode: "validate" }` | Validation authority and fix loop |
| A4 | `ecp config secrets set test.secret` (stdin); `ecp commit` a `test/default` config with `{ "$secret": "test.secret" }`; a `config-echo` step receives it; the value appears nowhere in run files, events, responses or logs | Config, secrets, redaction |
| A5 | `$script` by path and by source into a capability expecting a string with `maxLength`; a syntax error reports line/column; an over-long script fails `ECP_INPUT_INVALID` | `$script` |
| A6 | With an MCP client connected through the relay and a `delay` run in progress: `ecp plugins link` a second fixture plugin → supervisor drains (run finishes) and restarts the host → the relay's next `retrieve` shows the new capability without reconnecting. Repeat with `--force` restart during a run → run `interrupted` → `execute { resume }` completes it | Supervisor, relay, resume |
| A7 | `commit` an execution; `commit` update with an `@id` patch and correct `ifVersion` → version 2; stale `ifVersion` → `ECP_VERSION_CONFLICT`; `execute { id, patch }` runs a variant without saving | Commit and patches |
| A8 | App (Playwright): `ecp app <path>` opens the file; validation issues show; saving fixes to the file (and to a `$script.path` file) hot-reloads the graph and issues within 1 s with no action in the App; run → live statuses and result; runs list **replays statuses on the graph** (reload clears live overlay; selecting a past run restores step `data-status` on nodes) | App, hot reload by path |
| A9 | Every A1–A5 command run once with a warm host and once in-process gives identical `data` (except timing and run ids) | Mode parity |
| A10 | Live (manual or CI with secrets): the Firefly `localize-banner` execution (converted dogfood) validates and runs against real Firefly and Anthropic, producing a PSD; output recorded in the Phase 8 PR | Real dogfood |
| A11 | Benchmarks B1–B8 recorded; the background-host decision written in the plan; budgets enforced in CI | Performance decision |
| A12 | `legacy/` deleted; `pnpm run check` green; coverage floors met; docs and agent rules match the code | Clean finish |
