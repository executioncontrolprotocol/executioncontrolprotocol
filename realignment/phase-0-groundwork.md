# Phase 0 — Groundwork

**Goal:** a clean workspace for new code, the `protocol` package with every schema, the full
fixture suite, and the early benchmark numbers. After this phase every later phase builds
against fixed contracts.

**Depends on:** nothing. **Spec:** 01, 02, 03 (schemas only), 05, 06, 12.

## Tasks

1. **Move legacy out of the workspace.**
   - `git mv packages legacy/packages`, `git mv plugins legacy/plugins`, `git mv examples legacy/examples`, `git mv fixtures legacy/fixtures` (the old consumer-cli smoke fixtures), `git mv scripts legacy/scripts` (keep only scripts the new root still needs, e.g. `lint-yaml.mjs`, `clean-dist.mjs`, `check-no-file-deps` → move those back to `scripts/`).
   - `pnpm-workspace.yaml`: `packages/*`, `plugins/*` only. Bump the catalog: `zod: ^4`, keep TypeScript/Vitest/ESLint versions.
   - Root `package.json`: replace scripts with the set in spec 01; drop legacy-only scripts and dev deps (browser vitest, plugin-pack smoke).
   - `tsconfig.build.json`, `vitest.config.mts`, `eslint.config.mjs`, `.markdownlint-cli2.yaml`, `.secretlintignore`: remove legacy paths; ignore `legacy/**` in ESLint, markdownlint (keep lint on `realignment/` and root docs), Vitest and coverage.
   - CI: jobs per spec 01; update `.github/rulesets/*.json` check names to match.
   - Update `AGENTS.md` repo map and `realignment/doc-index.md` for the new paths.
2. **Scaffold all MVP packages** (01 table) with `package.json`, `tsconfig.json`, `src/index.ts` exporting nothing but a version constant, one smoke test each. Wire project references. `pnpm run build` and `pnpm run test:unit` pass.
3. **`protocol` package:**
   - Types for everything in spec 02, 03, 04 (events), 05, 06, 07 (service interfaces and token ids), 08 (handler context, plugin manifest), 09 (`host.json`).
   - JSON Schemas (draft 2020-12) in `packages/protocol/schemas/`: `execution.base.schema.json` (manifest without plugin-specific inputs, with the dispatch rules of 03), `config`, `run`, `step-record`, `run-event`, `plugin-manifest`, `host`, `retrieve.input`, `execute.input`, `commit.input`, `validation-result`, `envelope`.
   - `errors.ts`: the catalogue (06) as a const map `{ code: { httpStatus, exitCode, kind: "validation" | "runtime" | "request" | "host" | "internal" } }`, plus `ECP_SERVICE_*` internal codes.
   - `first-party.ts`: plugin id → package map for `ECP_PLUGINS_MISSING`.
   - Tests: every schema compiles under Ajv 2020; type/schema agreement checks (sample objects type-check and validate).
4. **Fixtures** (`fixtures/`, spec 12): `fixtures/plugins/fixture-plugin/ecp.manifest.json` with capabilities mirroring `plugin-test` (echo, fail, delay, stage, config-echo, file-roundtrip, call) plus a string-`maxLength` capability for `$script`; the full valid/invalid/run fixture sets with expected files; `localize-banner.ecp.json` (with Firefly/Anthropic capability shapes added to a second fixture manifest `fixtures/plugins/fixture-creative/`).
5. **v1 conversions:** copy `legacy/examples/{01-echo,02-weekly-brief,03-secrets-bind,06-invoke,07-accepts-returns,08-branch-loop}` and `legacy/examples/dogfood/*` into `fixtures/v1/` and write their v2 equivalents by hand (policy steps dropped, `version` → `replace`, `when`/`until` → `expr`, secrets → config objects). Each v2 file gets an expected run fixture.
6. **Early benchmarks** (`realignment/spikes/`, throwaway; legacy is no longer built after task 1, so use the published CLI: `npm install -g @executioncontrolprotocol/cli@0.52` in a temp prefix, plus the published plugins): legacy CLI cold-run timings (01-echo and a Firefly workflow, with `ECP_TIMING`-like breakdown by instrumenting with `--cpu-prof` or timestamps), QuickJS-WASM start and single-eval time, Ajv compile time for a generated schema with Firefly's ~84 capabilities (generate from the legacy plugin's zod schemas), Firefly plugin import time (from the published plugin package). Record numbers in `REALIGNMENT-PLAN.md` "Measurements".

## Tests

- Positive: every valid fixture validates against `execution.base.schema.json` (structure only; plugin inputs are Phase 1).
- Negative: every invalid fixture whose expected codes are L1-structural fails the base schema at the expected path.
- Edge: schema rejects `version: "1.0"`, `type: "workflow"`, `$secret` objects, `when`/`until` fields, `mode: "version"`.

## Exit criteria

- [x] `legacy/` is outside the workspace, build, lint, tests and coverage. CI workflow matches
  spec 01. Later green on the milestone/`development` line (PR #68, 2026-11-15):
  <https://github.com/executioncontrolprotocol/executioncontrolprotocol/actions/runs/43773251998>
  (all jobs including e2e-windows and app-windows).
- [x] All packages scaffolded. Local `pnpm run build`, `lint`, `secrets:scan`, `check:no-file-deps`, `test:coverage` (100% on the new sources), `test:integration`, `test:e2e` and `test:app` pass.
- [x] `protocol` covers spec 02–09 types and the JSON Schemas, with schema and catalogue tests.
- [x] Fixture suite includes the spec 12 minimum set, v1 copies and hand-written v2 files with expected run files.
- [x] Early benchmark numbers are in `REALIGNMENT-PLAN.md` "Measurements" (CLI 0.51.0, the latest on npm; 0.52 is not published).
- [x] Status updated in `realignment/README.md`.
