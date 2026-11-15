# 12 — Testing, benchmarks and MVP acceptance

## Test layers

| Layer | Location | Runs | Notes |
| --- | --- | --- | --- |
| Unit | `packages/*/test/**/*.test.ts`, `plugins/*/test/**` | `test:unit`, coverage gate | Pure, fast, no network, no real `ECP_HOME` |
| Conformance | `fixtures/` + `packages/engine/test/conformance.test.ts` | part of `test:unit` | Every fixture validated; expected issues compared exactly (code, path, severity; message substring) |
| Integration | `packages/host/test/integration/**` | `test:integration` | `createLocalHost` in-process, temp `ECP_HOME`, `plugin-test` via `extraPlugins` |
| E2E | `test/e2e/**` (root) | `test:e2e` | Spawns the built `ecp` bin: supervisor, host, relay over stdio (MCP SDK client), plugin pack/install/link; Ubuntu + Windows |
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
└── v1/                                        legacy examples and dogfood workflows (copied from legacy/) with their v2 conversions
```

Minimum fixture set (Phase 0 writes them; later phases add more):

- **Valid:** smallest execution; every node kind alone; nested branch-in-loop-in-parallel;
  every marker; every commit mode; `$script` by source and by path; `optional`/`fallback`;
  `localize-banner` (reference example, 02).
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
- **v1 conversions:** `legacy/examples/01,02,03,06,07,08` and `legacy/examples/dogfood/*`
  converted to v2 by hand; Phase 8 checks they run on the new engine with the expected state.

## Benchmarks (`bench/`)

`bench/run.mjs` (plain Node, no extra tools), writes `bench/results/<date>-<os>.json`, prints a
table. Each scenario 20 runs; median and p95.

| # | Scenario | Modes |
| --- | --- | --- |
| B1 | `ecp retrieve --type capability --id …` | in-process, warm host via CLI, via MCP relay |
| B2 | `ecp retrieve --type capability --query …` (all installed plugins incl. Firefly) | same |
| B3 | `ecp execute fixtures/…/echo.ecp.json` | same |
| B4 | `ecp execute` Firefly fixture ×10 in a row (plugin import + IMS token; live only) | same |
| B5 | `ecp execute` `$expr`-heavy fixture | same |
| B6 | `ecp host start` until healthy; restart until healthy | — |
| B7 | Host schema generation + validator compile with all MVP plugins installed | — |

**Phase 0** runs the early proxies with legacy code (`legacy/` CLI cold runs, QuickJS start,
Ajv compile of Firefly-sized schemas, Firefly import time) and records them in the plan's
"Measurements". **Phase 5** runs B1–B7 on the new CLI and applies the plan's decision rule:
warm host saves less than ~300 ms median per call on B3/B4 → the CLI stays in-process when no
host is running (current spec); otherwise implement auto-start with idle shutdown (15 min idle,
no active runs) and record the decision in the plan. Budgets are then set and enforced in CI.

## MVP acceptance scenarios

The MVP is done when **every** scenario passes as an automated test (E2E unless noted) on
Ubuntu and Windows CI, and A10 has been run live once with the result recorded.

| # | Scenario | Proves |
| --- | --- | --- |
| A1 | Fresh `ECP_HOME`. `ecp plugins link plugins/plugin-test`. `ecp retrieve --type capability --query echo` finds `test.echo`; `--id` returns `accepts` and `returns`. Same through an MCP client over `ecp mcp start` | Plugin loading from manifests, retrieve, relay |
| A2 | `ecp execute fixtures/manifests/runs/all-features.ecp.json --input @in.json` completes; result and every step status match the run fixture; `run.json`, step records, `events.ndjson` exist with the expected event order | Executor semantics end to end |
| A3 | Fix loop: for 8 broken manifests (one per L1/L2/L3 family), `ecp execute --validate --json` returns exactly the expected codes and paths with suggestions; applying the suggested fix makes each valid. Same via MCP `execute { mode: "validate" }` | Validation authority and fix loop |
| A4 | `ecp secrets set test.secret` (stdin); `ecp commit` a `test/default` config with `{ "$secret": "test.secret" }`; a `config-echo` step receives it; the value appears nowhere in run files, events, responses or logs | Config, secrets, redaction |
| A5 | `$script` by path and by source into a capability expecting a string with `maxLength`; a syntax error reports line/column; an over-long script fails `ECP_INPUT_INVALID` | `$script` |
| A6 | With an MCP client connected through the relay and a `delay` run in progress: `ecp plugins link` a second fixture plugin → supervisor drains (run finishes) and restarts the host → the relay's next `retrieve` shows the new capability without reconnecting. Repeat with `--force` restart during a run → run `interrupted` → `execute { resume }` completes it | Supervisor, relay, resume |
| A7 | `commit` an execution; `commit` update with an `@id` patch and correct `ifVersion` → version 2; stale `ifVersion` → `ECP_VERSION_CONFLICT`; `execute { id, patch }` runs a variant without saving | Commit and patches |
| A8 | App (Playwright): open a path-referenced execution, see validation issues, fix the file → graph updates, run → live statuses and result, runs list replays | App |
| A9 | Every A1–A5 command run once with a warm host and once in-process gives identical `data` (except timing and run ids) | Mode parity |
| A10 | Live (manual or CI with secrets): the Firefly `localize-banner` execution (converted dogfood) validates and runs against real Firefly and Anthropic, producing a PSD; output recorded in the Phase 8 PR | Real dogfood |
| A11 | Benchmarks B1–B7 recorded; the background-host decision written in the plan; budgets enforced in CI | Performance decision |
| A12 | `legacy/` deleted; `pnpm run check` green; coverage floors met; docs and agent rules match the code | Clean finish |
