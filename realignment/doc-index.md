# Docs and rules index

Every markdown file and agent rule in the MVP tree. Regenerate with
`node scripts/gen-doc-index.mjs` when docs are added or removed (enforced by `pnpm run lint`).

## How agents load rules

- **Claude Code:** `CLAUDE.md` → `@AGENTS.md`; points to `.cursor/rules/`, the spec and the plan.
- **Cursor:** `.cursor/rules/*.mdc` (`alwaysApply: true` ones always; others by `globs`).
- **Contributor skill:** `skills/ecp-core/` (`SKILL.md` + `references/`).
- **Source of truth:** `realignment/spec/`, then `REALIGNMENT-PLAN.md`, then phase docs.

## Summary

| Group | Files |
| --- | --- |
| Top-level docs | 9 |
| Agent rules | 13 |
| Plan / phases / spec | 34 |
| Package READMEs | 10 |
| Plugin READMEs | 6 |
| Contributor skill | 4 |
| Examples | 12 |
| Other | 18 |

## All files

| File | Group | Status |
| --- | --- | --- |
| `AGENTS.md` | Top-level docs | current |
| `ARCHITECTURE.md` | Top-level docs | current |
| `CHANGELOG.md` | Top-level docs | current |
| `CLAUDE.md` | Top-level docs | current |
| `README.md` | Top-level docs | current |
| `REALIGNMENT-PLAN.md` | Top-level docs | current |
| `RELEASING.md` | Top-level docs | current |
| `SETUP.md` | Top-level docs | current |
| `SPEC.md` | Top-level docs | current |
| `.cursor/rules/cli-crud.mdc` | Agent rules | current |
| `.cursor/rules/ecp-spec.mdc` | Agent rules | current |
| `.cursor/rules/extensions.mdc` | Agent rules | current |
| `.cursor/rules/file-formats.mdc` | Agent rules | current |
| `.cursor/rules/general.mdc` | Agent rules | current |
| `.cursor/rules/github-rulesets.mdc` | Agent rules | current |
| `.cursor/rules/no-backwards-compatibility.mdc` | Agent rules | current |
| `.cursor/rules/reactflow-render.mdc` | Agent rules | current |
| `.cursor/rules/realignment.mdc` | Agent rules | current |
| `.cursor/rules/secrets-keyring.mdc` | Agent rules | current |
| `.cursor/rules/testing-coverage.mdc` | Agent rules | current |
| `.cursor/rules/testing.mdc` | Agent rules | current |
| `.cursor/rules/typescript.mdc` | Agent rules | current |
| `realignment/README.md` | Plan / phases / spec | current |
| `realignment/doc-index.md` | Plan / phases / spec | current |
| `realignment/evidence/a10-localize-banner.md` | Plan / phases / spec | current |
| `realignment/file-access.md` | Plan / phases / spec | current |
| `realignment/mvp-audit-fixes.md` | Plan / phases / spec | current |
| `realignment/phase-0-groundwork.md` | Plan / phases / spec | current |
| `realignment/phase-1-engine.md` | Plan / phases / spec | current |
| `realignment/phase-2-plugins.md` | Plan / phases / spec | current |
| `realignment/phase-3-local-host.md` | Plan / phases / spec | current |
| `realignment/phase-4-host-server.md` | Plan / phases / spec | current |
| `realignment/phase-5-cli.md` | Plan / phases / spec | current |
| `realignment/phase-6-mcp-relay.md` | Plan / phases / spec | current |
| `realignment/phase-7-app.md` | Plan / phases / spec | current |
| `realignment/phase-8-plugins-and-dogfood.md` | Plan / phases / spec | current |
| `realignment/phase-9-acceptance.md` | Plan / phases / spec | current |
| `realignment/post-mvp-fluent-sdk.md` | Plan / phases / spec | current |
| `realignment/schema-scaling-plan.md` | Plan / phases / spec | current |
| `realignment/schema-scaling/s1-light-manifests.md` | Plan / phases / spec | current |
| `realignment/schema-scaling/s2-s6.md` | Plan / phases / spec | current |
| `realignment/spec/01-layout-and-stack.md` | Plan / phases / spec | current |
| `realignment/spec/02-execution-manifest.md` | Plan / phases / spec | current |
| `realignment/spec/03-validation.md` | Plan / phases / spec | current |
| `realignment/spec/04-executor.md` | Plan / phases / spec | current |
| `realignment/spec/05-objects-and-storage.md` | Plan / phases / spec | current |
| `realignment/spec/06-operations.md` | Plan / phases / spec | current |
| `realignment/spec/07-services.md` | Plan / phases / spec | current |
| `realignment/spec/08-plugins.md` | Plan / phases / spec | current |
| `realignment/spec/09-host-supervisor-relay.md` | Plan / phases / spec | current |
| `realignment/spec/10-cli.md` | Plan / phases / spec | current |
| `realignment/spec/11-app.md` | Plan / phases / spec | current |
| `realignment/spec/12-testing-and-acceptance.md` | Plan / phases / spec | current |
| `realignment/spec/README.md` | Plan / phases / spec | current |
| `realignment/spikes/schema-scale/README.md` | Plan / phases / spec | current |
| `realignment/transforms-and-typed-io.md` | Plan / phases / spec | current |
| `packages/app/README.md` | Package READMEs | current |
| `packages/cli/README.md` | Package READMEs | current |
| `packages/engine/README.md` | Package READMEs | current |
| `packages/formatters/README.md` | Package READMEs | current |
| `packages/host/README.md` | Package READMEs | current |
| `packages/local/README.md` | Package READMEs | current |
| `packages/mcp-relay/README.md` | Package READMEs | current |
| `packages/plugin-sdk/README.md` | Package READMEs | current |
| `packages/protocol/README.md` | Package READMEs | current |
| `packages/quickjs/README.md` | Package READMEs | current |
| `plugins/plugin-adobe-firefly-services/README.md` | Plugin READMEs | current |
| `plugins/plugin-anthropic/README.md` | Plugin READMEs | current |
| `plugins/plugin-azure-blob-storage/README.md` | Plugin READMEs | current |
| `plugins/plugin-core/README.md` | Plugin READMEs | current |
| `plugins/plugin-jsonata/README.md` | Plugin READMEs | current |
| `plugins/plugin-test/README.md` | Plugin READMEs | current |
| `skills/ecp-core/SKILL.md` | Contributor skill | current |
| `skills/ecp-core/references/examples.md` | Contributor skill | current |
| `skills/ecp-core/references/extension-authoring.md` | Contributor skill | current |
| `skills/ecp-core/references/package-boundaries.md` | Contributor skill | current |
| `examples/README.md` | Examples | current |
| `examples/branch-loop/README.md` | Examples | current |
| `examples/dogfood-caption/README.md` | Examples | current |
| `examples/dogfood-photo/README.md` | Examples | current |
| `examples/dogfood-reshape/README.md` | Examples | current |
| `examples/echo/README.md` | Examples | current |
| `examples/localize-banner/README.md` | Examples | current |
| `examples/psd-generate-background/README.md` | Examples | current |
| `examples/psd-layers/README.md` | Examples | current |
| `examples/transform-jsonata/README.md` | Examples | current |
| `examples/transform/README.md` | Examples | current |
| `examples/weekly-brief/README.md` | Examples | current |
| `.changeset/0.52.0-applied.md` | Other | current |
| `.changeset/README.md` | Other | current |
| `.changeset/azure-blob-delete.md` | Other | current |
| `.changeset/core-transform-step-contracts.md` | Other | current |
| `.changeset/file-service-pr1.md` | Other | current |
| `.changeset/host-auto-start.md` | Other | current |
| `.changeset/jsonata-transform-plugin.md` | Other | current |
| `.changeset/mvp-realignment-majors.md` | Other | current |
| `.changeset/plugin-commands.md` | Other | current |
| `.changeset/plugin-manifest-2.md` | Other | current |
| `.changeset/product-shaped-firefly-io.md` | Other | current |
| `.changeset/remove-input-expr.md` | Other | current |
| `.changeset/retrieve-schema-config-secrets.md` | Other | current |
| `.github/rulesets/README.md` | Other | current |
| `.github/workflows/README.md` | Other | current |
| `packages/app/DESIGN.md` | Other | current |
| `packages/app/REACTFLOW_RENDER.md` | Other | current |
| `plugins/plugin-adobe-firefly-services/openapi/content-tagging/SOURCE.md` | Other | current |
