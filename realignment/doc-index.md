# Docs and rules index

Every markdown file and agent rule in the repo, and its status in the realignment (updated 2026-11-14). Regenerate when docs are added or removed.

## How agents load rules

- **Claude Code:** `CLAUDE.md` → `@AGENTS.md`; `CLAUDE.md` also points to `.cursor/rules/`, the spec and the plan.
- **Cursor:** `.cursor/rules/*.mdc` (`alwaysApply: true` ones always; others by `globs`).
- **Contributor skill:** `skills/ecp-core/` (`SKILL.md` + `references/`).
- **Source of truth over all of them:** `realignment/spec/` (exact MVP contracts), then `REALIGNMENT-PLAN.md`, then the phase docs.
- There is no `.claude/` folder (no custom agents, commands or settings in the repo).

## Retired

- `RESET-PLAN.md` and `reset/` (the CLI reset plan and its phase docs) were removed on 2026-11-14. What still applies is in `REALIGNMENT-PLAN.md`, "Carried over from the CLI reset". Originals: `git show 27238c96:RESET-PLAN.md`.
- `realignment/phase-0-build-spec.md` (the earlier Phase 0 task list) was replaced on 2026-11-14 by `realignment/spec/` and `realignment/phase-0-groundwork.md`.

## Summary

| Group | Files |
| --- | --- |
| Release tooling | 2 |
| Agent rules | 14 |
| CI docs | 2 |
| Top-level docs | 6 |
| Agent rules (Claude Code) | 1 |
| Plan | 2 |
| Legacy examples | 8 |
| Legacy package docs | 45 |
| Legacy package docs (App) | 2 |
| MVP phase docs | 10 |
| Post-MVP | 1 |
| MVP build spec | 13 |
| Contributor skill | 4 |

## All files

| File | Group | Status |
| --- | --- | --- |
| `.changeset/0.52.0-applied.md` | Release tooling | Unchanged |
| `.changeset/README.md` | Release tooling | Unchanged |
| `.cursor/rules/cli-crud.mdc` | Agent rules | Rewritten for the realignment; point to the spec |
| `.cursor/rules/ecp-spec.mdc` | Agent rules | Rewritten for the realignment; point to the spec |
| `.cursor/rules/extensions.mdc` | Agent rules | Rewritten for the realignment; point to the spec |
| `.cursor/rules/file-formats.mdc` | Agent rules | Rewritten for the realignment; point to the spec |
| `.cursor/rules/general.mdc` | Agent rules | Updated: stale reset references and legacy-only rules removed |
| `.cursor/rules/github-rulesets.mdc` | Agent rules | Unchanged (still valid) |
| `.cursor/rules/no-backwards-compatibility.mdc` | Agent rules | Updated: stale reset references and legacy-only rules removed |
| `.cursor/rules/reactflow-render.mdc` | Agent rules | Updated: stale reset references and legacy-only rules removed |
| `.cursor/rules/realignment-milestone.mdc` | Agent rules | New (replaces reset-milestone.mdc) |
| `.cursor/rules/secrets-keyring.mdc` | Agent rules | Updated: stale reset references and legacy-only rules removed |
| `.cursor/rules/testing-coverage.mdc` | Agent rules | Updated: stale reset references and legacy-only rules removed |
| `.cursor/rules/testing.mdc` | Agent rules | Unchanged (still valid) |
| `.cursor/rules/typescript.mdc` | Agent rules | Updated: stale reset references and legacy-only rules removed |
| `.github/rulesets/README.md` | CI docs | Unchanged until Phase 0 updates CI |
| `.github/workflows/README.md` | CI docs | Unchanged until Phase 0 updates CI |
| `AGENTS.md` | Agent rules | Rewritten for the realignment; points to the spec |
| `ARCHITECTURE.md` | Top-level docs | Rewritten: target architecture summary |
| `CHANGELOG.md` | Top-level docs | Unchanged history; dead link to the retired reset plan removed |
| `CLAUDE.md` | Agent rules (Claude Code) | Rewritten: loads AGENTS.md, points to the spec and plan |
| `README.md` | Top-level docs | Banner added; links point to the realignment plan |
| `REALIGNMENT-PLAN.md` | Plan | Decisions, architecture, rationale; MVP decisions section |
| `RELEASING.md` | Top-level docs | Updated: branch section points to milestone/realignment |
| `SETUP.md` | Top-level docs | Banner added; links point to the realignment plan |
| `SPEC.md` | Top-level docs | Banner added; links point to the realignment plan |
| `examples/01-echo/README.md` | Legacy examples | Moved to legacy/ in Phase 0; converted to v2 fixtures |
| `examples/02-weekly-brief/README.md` | Legacy examples | Moved to legacy/ in Phase 0; converted to v2 fixtures |
| `examples/03-secrets-bind/README.md` | Legacy examples | Moved to legacy/ in Phase 0; converted to v2 fixtures |
| `examples/06-invoke/README.md` | Legacy examples | Moved to legacy/ in Phase 0; converted to v2 fixtures |
| `examples/07-accepts-returns/README.md` | Legacy examples | Moved to legacy/ in Phase 0; converted to v2 fixtures |
| `examples/README.md` | Legacy examples | Moved to legacy/ in Phase 0; converted to v2 fixtures |
| `examples/dogfood/README.md` | Legacy examples | Dogfood tasks; Phase 0 moves to legacy/ and converts to fixtures |
| `fixtures/consumer-cli/README.md` | Legacy examples | Moved to legacy/ in Phase 0; converted to v2 fixtures |
| `packages/app/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `packages/app/DESIGN.md` | Legacy package docs (App) | Kept; Phase 7 moves DESIGN.md and updates REACTFLOW_RENDER.md |
| `packages/app/REACTFLOW_RENDER.md` | Legacy package docs (App) | Kept; Phase 7 moves DESIGN.md and updates REACTFLOW_RENDER.md |
| `packages/app/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `packages/cli/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `packages/cli/README.md` | Legacy package docs | Unchanged except the plan link |
| `packages/core/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `packages/core/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `packages/environments/browser/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `packages/environments/browser/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `packages/environments/node/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `packages/environments/node/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `packages/mcp/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `packages/mcp/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `packages/plugin-sdk/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `packages/plugin-sdk/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `plugins/plugin-adobe-firefly-services/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-adobe-firefly-services/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `plugins/plugin-adobe-firefly-services/openapi/content-tagging/SOURCE.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `plugins/plugin-anthropic/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-anthropic/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `plugins/plugin-app/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-app/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `plugins/plugin-approval/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-approval/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `plugins/plugin-azure-blob-storage/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-azure-blob-storage/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `plugins/plugin-budget/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-budget/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `plugins/plugin-fal/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-fal/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `plugins/plugin-format-mermaid/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-format-mermaid/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `plugins/plugin-format-toon/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-format-toon/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `plugins/plugin-image-sharp/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-image-sharp/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `plugins/plugin-jsonata/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-jsonata/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `plugins/plugin-ollama/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-ollama/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `plugins/plugin-openai/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-openai/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `plugins/plugin-state-control/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-state-control/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `plugins/plugin-test/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-test/README.md` | Legacy package docs | Describes legacy code; moved to legacy/ in Phase 0, deleted in Phase 9 |
| `realignment/README.md` | Plan | Phase index |
| `realignment/phase-0-groundwork.md` | MVP phase docs | New 2026-11-14: tasks, tests, exit criteria |
| `realignment/phase-1-engine.md` | MVP phase docs | New 2026-11-14: tasks, tests, exit criteria |
| `realignment/phase-2-plugins.md` | MVP phase docs | New 2026-11-14: tasks, tests, exit criteria |
| `realignment/phase-3-local-host.md` | MVP phase docs | New 2026-11-14: tasks, tests, exit criteria |
| `realignment/phase-4-host-server.md` | MVP phase docs | New 2026-11-14: tasks, tests, exit criteria |
| `realignment/phase-5-cli.md` | MVP phase docs | New 2026-11-14: tasks, tests, exit criteria |
| `realignment/phase-6-mcp-relay.md` | MVP phase docs | New 2026-11-14: tasks, tests, exit criteria |
| `realignment/phase-7-app.md` | MVP phase docs | New 2026-11-14: tasks, tests, exit criteria |
| `realignment/phase-8-plugins-and-dogfood.md` | MVP phase docs | New 2026-11-14: tasks, tests, exit criteria |
| `realignment/phase-9-acceptance.md` | MVP phase docs | New 2026-11-14: tasks, tests, exit criteria |
| `realignment/post-mvp-fluent-sdk.md` | Post-MVP | New 2026-11-14: Fluent SDK (not part of the MVP) |
| `realignment/spec/01-layout-and-stack.md` | MVP build spec | New 2026-11-14: exact contracts, implemented as written |
| `realignment/spec/02-execution-manifest.md` | MVP build spec | New 2026-11-14: exact contracts, implemented as written |
| `realignment/spec/03-validation.md` | MVP build spec | New 2026-11-14: exact contracts, implemented as written |
| `realignment/spec/04-executor.md` | MVP build spec | New 2026-11-14: exact contracts, implemented as written |
| `realignment/spec/05-objects-and-storage.md` | MVP build spec | New 2026-11-14: exact contracts, implemented as written |
| `realignment/spec/06-operations.md` | MVP build spec | New 2026-11-14: exact contracts, implemented as written |
| `realignment/spec/07-services.md` | MVP build spec | New 2026-11-14: exact contracts, implemented as written |
| `realignment/spec/08-plugins.md` | MVP build spec | New 2026-11-14: exact contracts, implemented as written |
| `realignment/spec/09-host-supervisor-relay.md` | MVP build spec | New 2026-11-14: exact contracts, implemented as written |
| `realignment/spec/10-cli.md` | MVP build spec | New 2026-11-14: exact contracts, implemented as written |
| `realignment/spec/11-app.md` | MVP build spec | New 2026-11-14: exact contracts, implemented as written |
| `realignment/spec/12-testing-and-acceptance.md` | MVP build spec | New 2026-11-14: exact contracts, implemented as written |
| `realignment/spec/README.md` | MVP build spec | New 2026-11-14: exact contracts, implemented as written |
| `skills/ecp-core/SKILL.md` | Contributor skill | Rewritten for the realignment |
| `skills/ecp-core/references/examples.md` | Contributor skill | Rewritten for the realignment |
| `skills/ecp-core/references/extension-authoring.md` | Contributor skill | Rewritten for the realignment |
| `skills/ecp-core/references/package-boundaries.md` | Contributor skill | Rewritten for the realignment |
