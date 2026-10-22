# Phase 5 — Plugins to npm

> Status: Planned · Branch: `feat/phase-5-plugins` (one PR per few plugins) · Depends on:
> Phase 4 · Plan: §4.2, §5.4

## Goal

Every first-party capability set is its own npm plugin, installable with one command,
versioned independently, and checked in CI from a clean install. Release tooling moves to
Changesets, and prereleases go out under the `next` dist-tag from the milestone branch.

## Scope

**In:**

- Migrating the remaining extensions and policies to `plugins/plugin-<name>`.
- Format plugins as converters.
- Changesets.
- Plugin smoke tests.
- `next` prereleases.

**Out:**

- `plugin-app` (Phase 8) and the MCP package (Phase 7).

## Plugin list

Plugin name = `plugin-` + the extension or policy name exactly. Ids don't change, so existing
capability ids keep working.

| Plugin | From | Capabilities | `.supports()` | Notes |
| --- | --- | --- | --- | --- |
| `plugin-jsonata` | `vendor/jsonata` | `transform` | any | Done in Phase 3 |
| `plugin-anthropic` | `extensions/anthropic` | `generate` | Node, browser | `evaluate` removed in Phase 1 |
| `plugin-openai` | `extensions/openai` | `generate` | Node | |
| `plugin-ollama` | `extensions/ollama` | `generate`, `listModels` | Node | |
| `plugin-fal` | `vendor/fal` | `generate` | Node | |
| `plugin-image-sharp` | `vendor/image-sharp` | 11 (`inspect` … `derive`) | Node | `sharp` is native. Verify prebuilt binaries install under oclif's npm on Windows, macOS and Linux |
| `plugin-azure-blob-storage` | `vendor/azure-blob-storage` | `upload`, `download`, `create-sas-url` | any | |
| `plugin-adobe-firefly-services` | `vendor/adobe-firefly-services` | 84 generated | Node | One plugin, not split. Add an oclif topic alias `firefly`. Keep the OpenAPI generator script with the plugin |
| `plugin-format-toon` | `extensions/format-toon` | `encode`, `decode` | any | Also registers the `toon` format for `--format` |
| `plugin-format-mermaid` | `extensions/format-mermaid` | `encode` | any | Also registers the `mermaid` format for `--format` |
| `plugin-budget` | `policies` (budget) | — (policy) | any | No commands; shows in `ecp describe --policies` |
| `plugin-approval` | `policies` (approval) | — (policy) | any | Pausing gives `ECP_RUN_PAUSED`. Allows a step once the journal records an approval for it (`ecp runs resume --approve`) |
| `plugin-state-control` | `policies` (state-control) | — (policy) | any | Core's `MISSING_STATE_CONTROL_POLICY` check points here |

After this phase `packages/extensions`, `packages/vendor` and `packages/policies` are empty
and deleted.

## Tasks

### 1. Per-plugin migration checklist

Do these for each plugin, in the order of the table (jsonata is already done):

1. `git mv` the source to `plugins/plugin-<name>`; rename the package.
2. `package.json`: only the hand-maintained parts (name, version, dependencies,
   `peerDependencies: { "@executioncontrolprotocol/core": "^1" }`, a dependency on
   `plugin-sdk`), the workspace CLI as a dev dependency, and the build script
   `tsc -b && ecp plugins build`.
3. Run `ecp plugins build` once and commit what it wrote (`ecp.extension`, `exports`, the
   `oclif` block, keywords, `files`). Don't write `oclif.ts` or the manifest by hand.
4. Remove any leftover `register*Extension()` helper or module-level registration.
5. Set `.supports()` per the table.
6. `ecp plugins check` passes.
7. README: one-line install (`ecp plugins install <name>`), a capability table, config fields,
   and the secrets it expects (as `secrets("…")` keys).
8. Move its examples from `examples/vendor/*` to `plugins/plugin-<name>/examples/` as single
   `*.ecp.ts` files.
9. Its tests still pass. Add one CLI-level test that runs a generated command with `--json`.

### 2. Format plugins as converters (§4.2)

- Their `encode`/`decode` capabilities get generated commands like any plugin, for example
  `ecp format-toon encode --input workflow.json`.
- They also register with core's encoding host, so `ecp describe --format toon` and
  `ecp compile <file> --format mermaid` work once they're installed.
- `--format` with a missing format plugin gives `ECP_PLUGINS_MISSING` naming the plugin.

### 3. Policy plugins

Split `packages/policies` into `plugins/plugin-budget`, `plugin-approval` and
`plugin-state-control`. Each:

- Exports its `definePolicy(...)` definition as `ecp.extension`.
- Has `toCommands()` return no commands.
- Keeps its existing tests.

### 4. Changesets

- Add `@changesets/cli`. `.changeset/config.json` uses independent versioning, with
  `access: public` and `baseBranch: development`.
- Every new 1.0 package starts at `1.0.0-next.0`: `core`, `node`, `browser`, `cli`,
  `plugin-sdk`, and every plugin.
- Remove `scripts/bump-all-ecp-versions.mjs`, `publish-workspaces.mjs` and
  `check-version-gt-published.mjs`, and the root scripts that call them.
- Replace `.github/workflows/development.yml` (the lockstep version check) with a Changesets
  status check on PRs into `development` and `milestone/**`.
- `ci-pipeline.yml` `publish` job: switch to `changesets/action`. Keep the
  `ENABLE_NPM_PUBLISH` gate.
- Update `RELEASING.md` for Changesets.

### 5. `next` prereleases from the milestone branch

- Enter prerelease mode on the milestone branch (`changeset pre enter next`).
- Add a manually triggered workflow, `release-next.yml` (`workflow_dispatch`, milestone branch
  only), that runs build and tests, then `changeset publish --tag next`.
- `main` publishing stays untouched until Phase 9.

### 6. Plugin smoke test (`scripts/plugin-pack-smoke.mjs`)

Replaces `vendor-pack-smoke` and `consumer-cli-smoke`. For each plugin:

1. `pnpm pack` the plugin, `core`, `plugin-sdk` and `cli`.
2. Install the packed CLI into a temp prefix, and point `ECP_DATA_DIR` and `ECP_CONFIG_DIR` at
   temp folders.
3. `ecp plugins install <plugin tarball>`.
4. Run `ecp <topic> --help`, and one offline `--json` invocation where possible: jsonata,
   image-sharp (fixture image), format-toon, format-mermaid.
5. Assert exit codes and envelope shape.

Run it in CI for every plugin on every PR. Rework `fixtures/consumer-cli` into the fixture
this script uses.

## Verification

- `plugin-pack-smoke` is green for all 13 plugins.
- From a clean machine (or a fresh container):
  `npm i -g @executioncontrolprotocol/cli@next && ecp plugins install jsonata@next` works, and
  `ecp jsonata transform --help` shows summary, use cases and input fields.
- `ecp --help` with all first-party plugins installed takes under 1 s (§2.4, criterion 10).

## Exit criteria

- [ ] All 13 plugins in the table exist under `plugins/`, build, test and smoke-test green.
- [ ] `packages/extensions`, `packages/vendor` and `packages/policies` are gone.
- [ ] Changesets replace the old release scripts; `next` prereleases are published.
- [ ] §2.4 criteria 1, 3, 4 and 10 pass against `@next` packages.
- [ ] Phase status updated in `reset/README.md` and `RESET-PLAN.md` §7.

## Risks

| Risk | Mitigation |
| --- | --- |
| `sharp`'s native binaries fail under oclif's plugin install | Test on all three OSes in the smoke matrix. If needed, document `npm_config_platform` overrides or pin a `sharp` version with prebuilt binaries |
| 84 Firefly commands slow down help and autocomplete | The manifest makes help cheap. Measure with criterion 10, and keep the `firefly` alias for typing |
| Prerelease publishing from a non-default branch leaks into `latest` | Publish only with `--tag next`, from a manual workflow restricted to the milestone branch |
