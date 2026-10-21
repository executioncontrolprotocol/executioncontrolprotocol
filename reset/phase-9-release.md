# Phase 9 — 1.0 release

> Status: Planned · Branch: `milestone/cli-reset` → `development` → `main` · Depends on:
> Phases 6, 7, 8 · Plan: §2.4

## Goal

Ship 1.0 from `main`, retire the 0.x packages cleanly, and leave the repo and its neighbours
pointing at the new architecture.

## Tasks

### 1. Confirm the success criteria

Check every item in `RESET-PLAN.md` §2.4 and link the evidence in the release PR:

- **Criteria 1, 3, 4, 10:** Phase 5 smoke tests and timing.
- **Criterion 2:** Phase 4 integration tests.
- **Criterion 5:** core test projects.
- **Criterion 6:** `grep` for harness, eval and EQL code.
- **Criteria 7–9:** dogfood records in `reset/dogfood/`.
- **Criterion 11:** the deployed docs site.

### 2. Versions

- Exit Changesets prerelease mode (`changeset pre exit`).
- Add a changeset taking every 1.0 package to `1.0.0`: `core`, `node`, `browser`, `cli`,
  `mcp`, `plugin-sdk`, `app`, `plugin-app`, and every plugin.
- **Tag names:** a `v1.0.0` tag already exists. It points at `a938230` (2026-06-07, the old
  fluent-api merge). Don't reuse it. Release tags are the per-package tags Changesets creates
  (`@executioncontrolprotocol/cli@1.0.0`, …), plus one annotated milestone tag
  `ecp-1.0.0` on the release commit.

### 3. Merge path

1. PR `milestone/cli-reset` → `development`. CI must be green. The Changesets status check
   replaced the old lockstep version check in Phase 5.
2. PR `development` → `main`. Confirm `ENABLE_NPM_PUBLISH=true` right before merging. Merging
   publishes through `changesets/action`.
3. Verify on npm: every 1.0 package has `latest` = `1.0.0`, and the `next` tag points at
   `1.0.0` or is removed.

### 4. Deprecate the 0.x packages

All 31 current packages are on npm at `0.14.0`. Packages that keep their name (`core`,
`node`, `browser`, `cli`, `mcp`) need nothing: 1.0 supersedes them. The rest get
`npm deprecate "<pkg>@<1.0.0" "<message>"`:

| 0.x package | Message points to |
| --- | --- |
| `types` | `@executioncontrolprotocol/core/types` |
| `policies` | `plugin-budget`, `plugin-approval`, `plugin-state-control`; `registry-control` is in core |
| `extensions` | Install plugins with `ecp plugins install` |
| `anthropic` | `plugin-anthropic` |
| `extension-openai` | `plugin-openai` |
| `extension-ollama` | `plugin-ollama` |
| `fal` | `plugin-fal` |
| `jsonata` | `plugin-jsonata` |
| `image-sharp` | `plugin-image-sharp` |
| `azure-blob-storage` | `plugin-azure-blob-storage` |
| `adobe-firefly-services` | `plugin-adobe-firefly-services` |
| `format-toon` | `plugin-format-toon` |
| `format-mermaid` | `plugin-format-mermaid` |
| `format-reactflow` | `@executioncontrolprotocol/app` |
| `secrets`, `process-env` | Built into `@executioncontrolprotocol/node` |
| `harnesses-browser-nano`, `harnesses-browser-coding` | Removed. ECP no longer ships harnesses; use the `ecp` skill |
| `runtime-temporal` | Removed. A Temporal environment is planned |
| `format-eql`, `chrome-ai`, `browser-secrets`, `extension-memory`, `extension-telemetry`, `extension-storage`, `slack` | Removed in 1.0 |

### 5. Outside the repo

- Archive the GitHub repos `executioncontrolprotocol/extensions` and
  `executioncontrolprotocol/browser-demo`. Both already say they moved into the monorepo.
- Turn off GitHub Pages for the monorepo (the docs repo hosts the site).
- Update the docs site's changelog and announce 1.0.

### 6. Tidy up

- Move `reset/` to `docs/history/cli-reset/` or keep it in place as the record. Update
  `RESET-PLAN.md`'s status line to "Shipped".
- Keep `milestone/cli-reset` until 1.0.1 to make hotfix backports easy, then delete it.
- Update the agent-os knowledge note (`ecp-delegation-reset.md`) to "shipped".

## Exit criteria

- [ ] All §2.4 criteria pass, with evidence linked.
- [ ] 1.0 packages published from `main`; the 0.x packages are deprecated with pointers.
- [ ] Old repos archived; Pages off; docs updated.
