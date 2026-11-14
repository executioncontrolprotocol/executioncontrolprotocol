# Docs and rules index

Every markdown file and agent rule in the repo on 2026-11-14, and what the realignment did to it before any code was written. Regenerate when docs are added or removed.

## How agents load rules

- **Claude Code:** `CLAUDE.md` → `@AGENTS.md`; `CLAUDE.md` also points to `.cursor/rules/` and the plan.
- **Cursor:** `.cursor/rules/*.mdc` (`alwaysApply: true` ones always; others by `globs`).
- **Contributor skill:** `skills/ecp-core/` (`SKILL.md` + `references/`).
- **Source of truth over all of them:** `REALIGNMENT-PLAN.md`, then `realignment/`.
- There is no `.claude/` folder (no custom agents, commands or settings in the repo).

## Summary

| Group | Files |
| --- | --- |
| Release tooling | 2 |
| Agent rules | 14 |
| CI docs | 2 |
| Top-level docs | 6 |
| Agent rules (Claude Code) | 1 |
| Plan | 3 |
| History | 21 |
| Legacy examples | 7 |
| Legacy package docs | 45 |
| Legacy package docs (App) | 2 |
| Contributor skill | 4 |

## All files

| File | Group | Action |
| --- | --- | --- |
| `.changeset/0.52.0-applied.md` | Release tooling | Unchanged |
| `.changeset/README.md` | Release tooling | Unchanged |
| `.cursor/rules/cli-crud.mdc` | Agent rules | Rewritten for the realignment |
| `.cursor/rules/ecp-spec.mdc` | Agent rules | Rewritten for the realignment |
| `.cursor/rules/extensions.mdc` | Agent rules | Rewritten for the realignment |
| `.cursor/rules/file-formats.mdc` | Agent rules | Rewritten for the realignment |
| `.cursor/rules/general.mdc` | Agent rules | Updated: stale reset references and legacy-only rules removed |
| `.cursor/rules/github-rulesets.mdc` | Agent rules | Unchanged (still valid) |
| `.cursor/rules/no-backwards-compatibility.mdc` | Agent rules | Updated: stale reset references and legacy-only rules removed |
| `.cursor/rules/reactflow-render.mdc` | Agent rules | Updated: stale reset references and legacy-only rules removed |
| `.cursor/rules/realignment-milestone.mdc` | Agent rules | New (replaces reset-milestone.mdc) |
| `.cursor/rules/secrets-keyring.mdc` | Agent rules | Updated: stale reset references and legacy-only rules removed |
| `.cursor/rules/testing-coverage.mdc` | Agent rules | Updated: stale reset references and legacy-only rules removed |
| `.cursor/rules/testing.mdc` | Agent rules | Unchanged (still valid) |
| `.cursor/rules/typescript.mdc` | Agent rules | Updated: stale reset references and legacy-only rules removed |
| `.github/rulesets/README.md` | CI docs | Unchanged (still valid) |
| `.github/workflows/README.md` | CI docs | Unchanged (still valid) |
| `AGENTS.md` | Agent rules | Rewritten for the realignment |
| `ARCHITECTURE.md` | Top-level docs | Rewritten: target architecture summary |
| `CHANGELOG.md` | Top-level docs | Unchanged (release history and process; revisit at release) |
| `CLAUDE.md` | Agent rules (Claude Code) | Rewritten: loads AGENTS.md, points to the plan |
| `README.md` | Top-level docs | Banner added: describes legacy code / published 0.52 |
| `REALIGNMENT-PLAN.md` | Plan | New: source of truth |
| `RELEASING.md` | Top-level docs | Updated: branch section points to `milestone/realignment` |
| `RESET-PLAN.md` | History | Banner added: superseded |
| `SETUP.md` | Top-level docs | Banner added: describes legacy code / published 0.52 |
| `SPEC.md` | Top-level docs | Banner added: describes legacy code / published 0.52 |
| `examples/01-echo/README.md` | Legacy examples | Unchanged; converted to v2 fixtures in Phase 0 |
| `examples/02-weekly-brief/README.md` | Legacy examples | Unchanged; converted to v2 fixtures in Phase 0 |
| `examples/03-secrets-bind/README.md` | Legacy examples | Unchanged; converted to v2 fixtures in Phase 0 |
| `examples/06-invoke/README.md` | Legacy examples | Unchanged; converted to v2 fixtures in Phase 0 |
| `examples/07-accepts-returns/README.md` | Legacy examples | Unchanged; converted to v2 fixtures in Phase 0 |
| `examples/README.md` | Legacy examples | Unchanged; converted to v2 fixtures in Phase 0 |
| `fixtures/consumer-cli/README.md` | Legacy examples | Unchanged; converted to v2 fixtures in Phase 0 |
| `packages/app/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `packages/app/DESIGN.md` | Legacy package docs (App) | Unchanged; App carries over. REACTFLOW_RENDER.md still says .when(): update in the App phase |
| `packages/app/REACTFLOW_RENDER.md` | Legacy package docs (App) | Unchanged; App carries over. REACTFLOW_RENDER.md still says .when(): update in the App phase |
| `packages/app/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `packages/cli/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `packages/cli/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `packages/core/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `packages/core/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `packages/environments/browser/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `packages/environments/browser/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `packages/environments/node/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `packages/environments/node/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `packages/mcp/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `packages/mcp/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `packages/plugin-sdk/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `packages/plugin-sdk/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `plugins/plugin-adobe-firefly-services/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-adobe-firefly-services/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `plugins/plugin-adobe-firefly-services/openapi/content-tagging/SOURCE.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `plugins/plugin-anthropic/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-anthropic/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `plugins/plugin-app/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-app/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `plugins/plugin-approval/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-approval/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `plugins/plugin-azure-blob-storage/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-azure-blob-storage/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `plugins/plugin-budget/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-budget/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `plugins/plugin-fal/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-fal/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `plugins/plugin-format-mermaid/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-format-mermaid/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `plugins/plugin-format-toon/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-format-toon/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `plugins/plugin-image-sharp/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-image-sharp/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `plugins/plugin-jsonata/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-jsonata/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `plugins/plugin-ollama/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-ollama/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `plugins/plugin-openai/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-openai/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `plugins/plugin-state-control/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-state-control/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `plugins/plugin-test/CHANGELOG.md` | Legacy package docs | Unchanged (release history) |
| `plugins/plugin-test/README.md` | Legacy package docs | Unchanged: describes legacy code; replaced or deleted with the package |
| `realignment/README.md` | Plan | New: phase docs |
| `realignment/phase-0-build-spec.md` | Plan | New: phase docs |
| `reset/README.md` | History | Banner added: superseded |
| `reset/dogfood/README.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/dogfood/phase-6-1.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/dogfood/phase-6-2.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/dogfood/phase-6-3.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/dogfood/phase-7-1.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/dogfood/phase-7-2.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/dogfood/phase-7-3.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/dogfood/phase-8.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/later.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/phase-0-merge-and-freeze.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/phase-1-trim.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/phase-2-core-and-environments.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/phase-3-plugin-sdk-and-cli.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/phase-4-workflow-files-and-observability.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/phase-5-plugins-to-npm.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/phase-6-docs-and-skill.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/phase-7-mcp.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/phase-8-app.md` | History | Unchanged; covered by the reset/README.md banner |
| `reset/phase-9-release.md` | History | Unchanged; covered by the reset/README.md banner |
| `skills/ecp-core/SKILL.md` | Contributor skill | Rewritten for the realignment |
| `skills/ecp-core/references/examples.md` | Contributor skill | Rewritten for the realignment |
| `skills/ecp-core/references/extension-authoring.md` | Contributor skill | Rewritten for the realignment |
| `skills/ecp-core/references/package-boundaries.md` | Contributor skill | Rewritten for the realignment |
