# Phase 9 — MVP acceptance and cleanup

**Goal:** every MVP acceptance scenario passes as an automated test, legacy code is gone, and
the docs and agent rules describe exactly what was built.

**Depends on:** Phases 0–8. **Spec:** 12 (acceptance), all.

## Tasks

1. **Acceptance suite:** `test/e2e/acceptance/A1…A12.test.ts`, one file per scenario in spec 12, running against built packages with temp homes (A8 in Playwright, A10 gated on secrets, A11 checks that the benchmark decision and budgets exist). Run in CI on Ubuntu and Windows.
2. **Delete `legacy/`** in one PR after confirming nothing outside it imports from it (CI check: no path under `legacy/` referenced by any workspace file). Remove `legacy` ignores from tool configs.
3. **Docs:**
   - `README.md`: the MVP quick start (install CLI, `ecp host start`, link/install a plugin, write an `.ecp.json`, `ecp execute`, `ecp mcp start` for agents, `ecp app`).
   - `ARCHITECTURE.md`: current, matching the code.
   - `SPEC.md`: replaced by a pointer to `realignment/spec/` (or the spec moved to `docs/spec/` and linked).
   - `SETUP.md`: development setup for the new packages.
   - Package READMEs for every new package.
4. **Agent rules:** update `AGENTS.md` (repo map without legacy, real commands), `.cursor/rules/*` (paths, commands), `skills/ecp-core/` (current, with the plugin authoring guide pointing at `plugin-test` as the reference), regenerate `realignment/doc-index.md`.
5. **Release readiness (no publish):** Changesets entries for every package (new major); `RELEASING.md` updated for the new package set; list of 0.x packages to `npm deprecate` with their replacements; release tag naming decided (not `v1.0.0`).
6. **Retrospective section** in `REALIGNMENT-PLAN.md`: what changed from the spec during the build and why.

## Exit criteria

- [x] A1–A12 pass in CI (A10 recorded from its live run). Evidence: `test/e2e/acceptance/`, Windows `app-windows` job, `realignment/evidence/a10-localize-banner.*`.
- [x] `legacy/` deleted; `pnpm run check` green; coverage floors met everywhere.
- [x] Docs and rules updated; doc index regenerated (`node scripts/gen-doc-index.mjs`).
- [x] Release checklist ready for the publish decision (`RELEASING.md`, `.changeset/mvp-realignment-majors.md`). No publish in this phase.
