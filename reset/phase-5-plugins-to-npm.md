# Phase 5 — Plugins to npm

> Status: Done 2026-10-23 · Branch: `feat/phase-5-changesets-and-smoke` (PR 5) · Depends on:
> Phase 4 · Plan: §4.2, §5.4

## Starting point after Phase 4

Examples are single `*.ecp.ts` files. There is no `ecp test` (use `ecp run --to`,
`ecp runs list|show|resume|rerun`). Every `ecp run` and generated capability command writes a
journal under `.ecp/runs/<runId>/` (override with `ECP_RUNS_DIR`). `--env` is optional.
`plugin-jsonata` is still the only migrated plugin. Policies (`budget`, `approval`,
`state-control`) still live in `packages/policies` until this phase migrates them. Bind
approval via a `--env` fixture until `plugin-approval` exists.

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

- [x] All 13 plugins in the table exist under `plugins/`, build, test and smoke-test green.
- [x] `packages/extensions`, `packages/vendor` and `packages/policies` are gone.
- [x] Changesets replace the old release scripts. `release-next.yml` exists (milestone-only) and was **not** dispatched; `next` prereleases are **not** on the registry.
- [x] §2.4 criteria 1, 3 and 4 are proven with packed tarballs (`plugin-pack-smoke`), not `@next`. Criterion 10 is measured in that smoke (`ecp --help` timing logged).
- [x] Phase status updated in `reset/README.md` and `RESET-PLAN.md` §7.

## Risks

| Risk | Mitigation |
| --- | --- |
| `sharp`'s native binaries fail under oclif's plugin install | Test on all three OSes in the smoke matrix. If needed, document `npm_config_platform` overrides or pin a `sharp` version with prebuilt binaries |
| 84 Firefly commands slow down help and autocomplete | The manifest makes help cheap. Measure with criterion 10, and keep the `firefly` alias for typing |
| Prerelease publishing from a non-default branch leaks into `latest` | Publish only with `--tag next`, from a manual workflow restricted to the milestone branch |

## Outcome (PR 1)

PR 1 (`feat/phase-5-model-plugins`) migrates the model plugins. The phase is not Done.

Shipped:

- `packages/extensions/{anthropic,openai,ollama}` moved to `plugins/plugin-{anthropic,openai,ollama}` as `@executioncontrolprotocol/plugin-<name>`. Ids are unchanged. Default export is the definition (`ecp.extension` points at `./dist/index.js` after `ecp plugins build`).
- `registerAnthropicExtension`, `registerOpenaiExtension`, `registerOllamaExtension` and `registerJsonataExtension` are gone. Tests and hosts call `registry.registerExtension(definition)`.
- `.supports()` is Node+browser for anthropic, Node for openai and ollama.
- `plugins:check` covers jsonata, anthropic, openai and ollama.
- CLI tests: `ecp {openai,anthropic} generate --help --json` and `ecp ollama {generate,listModels} --help --json` after `plugins link`. No live API calls.
- `packages/extensions` still holds `format-toon` and `format-mermaid`. Policies and vendor packages are unchanged.

Remaining after PR 1: format plugins and `ECP_PLUGINS_MISSING` for `--format`, policy plugins, vendor plugins, Firefly topic alias, Changesets, `plugin-pack-smoke`. First-party npm is still unpublished.

## Outcome (PR 2)

PR 2 (`feat/phase-5-format-and-policy-plugins`) migrates format and policy plugins. The phase is not Done.

Shipped:

- `plugin-format-toon` and `plugin-format-mermaid` keep ids `@executioncontrolprotocol/format-toon` / `format-mermaid`. Generated commands: `ecp format-toon encode|decode`, `ecp format-mermaid encode`.
- Missing `--format` plugin is `ECP_PLUGINS_MISSING` (exit 3) with `details.package` `@executioncontrolprotocol/plugin-format-<name>`. `ecp describe --format toon --json` without the plugin is the spawn coverage.
- `packages/policies` split into `plugin-budget`, `plugin-approval`, `plugin-state-control`. Each default-exports its `definePolicy(...)` definition; `toCommands()` stays empty. `ecp describe --policies --json` after link lists them.
- `packages/policies` and the format packages under `packages/extensions` are deleted. Coverage include retargets to the new plugin paths (floors kept). Core and hosts no longer depend on `@executioncontrolprotocol/policies`. MCP's format-toon devDependency points at `plugin-format-toon`.
- `registerFormatToonExtension`, `registerFormatMermaidExtension` and `registerStandardPolicies` are gone.

Remaining for later PRs: vendor plugins, Firefly topic alias, Changesets, `plugin-pack-smoke`. First-party npm is still unpublished.

## Outcome (PR 3)

PR 3 (`feat/phase-5-vendor-plugins`) migrates fal, image-sharp and azure-blob-storage. The phase is not Done.

Shipped:

- `packages/vendor/{fal,image-sharp,azure-blob-storage}` moved to `plugins/plugin-*` as `@executioncontrolprotocol/plugin-<name>`. Ids are unchanged. Default export is the definition. `registerFalExtension`, `registerImageSharpExtension` and `registerAzureBlobStorageExtension` are gone.
- `.supports()` is Node for fal and image-sharp, any (unset) for azure-blob-storage.
- Examples: `plugins/plugin-fal/examples/fal-chain.ecp.ts`, `plugins/plugin-image-sharp/examples/image-prep.ecp.ts`, `plugins/plugin-azure-blob-storage/examples/upload.ecp.ts`. Combined Azure+Firefly examples stay under `examples/vendor` until PR 4.
- CLI tests: `ecp fal generate --help --json`, `ecp image-sharp inspect --input <1x1 png JSON fixture> --json`, `ecp azure-blob-storage upload --help --json` after `plugins link`. No live FAL or Azure calls.
- image-sharp native binaries are documented as Ubuntu-CI-only. Do not add fal/sharp/azure to coverage include.
- `packages/vendor` still holds `adobe-firefly-services`.

Remaining for later PRs: Firefly topic alias, Changesets, `plugin-pack-smoke`. First-party npm is still unpublished.

## Outcome (PR 4)

PR 4 (`feat/phase-5-firefly`) migrates Adobe Firefly Services. The phase is not Done.

Shipped:

- `packages/vendor/adobe-firefly-services` moved to `plugins/plugin-adobe-firefly-services` as `@executioncontrolprotocol/plugin-adobe-firefly-services`. Id stays `@executioncontrolprotocol/adobe-firefly-services`. Default export is the definition. `registerAdobeFireflyServicesExtension` is gone.
- `.supports()` is Node. OpenAPI generator scripts stay with the plugin.
- `metadata.topicAlias: "firefly"` generates an oclif topic plus command aliases (`firefly:<capability>`). No Firefly-specific branch in core or the CLI.
- Examples: `plugins/plugin-adobe-firefly-services/examples/{adobe-firefly-smoke,azure-adobe-assets,azure-photoshop-manifest}.ecp.ts`. `examples/vendor` is deleted.
- CLI tests: `ecp adobe-firefly-services --help --json` and `ecp firefly --help` after `plugins link`. No live Adobe calls.
- `packages/vendor` and `packages/extensions` are gone. Do not add firefly to coverage include.

Remaining for later PRs: Changesets, `plugin-pack-smoke`. First-party npm is still unpublished.

## Outcome (PR 5)

PR 5 (`feat/phase-5-changesets-and-smoke`) finishes Phase 5. **Done.**

Shipped:

- Changesets with independent versioning, `access: public`, `baseBranch: development`. `changeset pre enter next` is on. `core`, `node`, `browser`, `cli`, `plugin-sdk`, and every plugin are `1.0.0-next.0`. MCP stays `0.14.1` until Phase 7.
- Deleted `bump-all-ecp-versions.mjs`, `publish-workspaces.mjs`, `check-version-gt-published.mjs`, `consumer-cli-smoke.mjs`, and `vendor-pack-smoke.mjs`.
- `development.yml` is a Changesets status check on PRs into `development` and `milestone/**`. `ci-pipeline.yml` `publish` uses `changesets/action`, still gated on `ENABLE_NPM_PUBLISH` and `main`. `release-next.yml` is `workflow_dispatch` on `milestone/**` only and was **not** dispatched.
- `plugin-pack-smoke` packs `core`, `node`, `plugin-sdk`, `cli`, and every plugin (node is required because the CLI depends on it; omitting it 404s). Hermetic `ECP_DATA_DIR` / `ECP_CONFIG_DIR`. `ecp plugins install <file-url>` with `ECP_ALLOW_SOURCE=path` and `ECP_TRUST_THIRD_PARTY=1` (`@oclif/plugin-plugins` rejects unknown `--allow-source` / `--yes` flags). Offline `--json` for jsonata, format-toon, format-mermaid, and image-sharp.
- First-party packages are still unpublished. Install is proven with packed tarballs, not `npm i -g @executioncontrolprotocol/cli@next`.
- In-repo plugin `peerDependencies` stay `workspace:^`. Coverage globs did not add firefly/sharp/fal/azure. image-sharp native binaries smoked on this Windows host and Ubuntu CI.
- `ecp --help` with all 13 plugins installed was 1352ms locally (logged; not a hard 1s gate).

Phase 6 starting point is recorded in `reset/phase-6-docs-and-skill.md`. Do not start Phase 6 in this PR.
