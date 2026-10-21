# Phase 1 — Trim

> Status: Next · Branch: `feat/phase-1-trim` · Depends on: Phase 0 · Plan: §5, §5.7

## Goal

Delete everything the reset removes, so later phases build on a small, honest codebase.
Nothing is renamed or redesigned here; that starts in Phase 2.

## Scope

**In:** deleting packages, modules, commands, examples, docs, scripts and CI jobs listed
below; the minimum edits needed to keep the rest building and tested.

**Out:**

- Folding packages together (Phase 2).
- Renaming `runtimes/*` to `environments/*` (Phase 2).
- Replacing the release scripts with Changesets (Phase 5).
- Converting examples to single-file workflows (Phase 4).
- `core/src/test-session` and `runtime/test-session-state.ts` **stay**. Phase 4 turns them into
  `ecp runs rerun`, because the executor already supports re-running one step.

## Tasks

Work in this order, one commit per numbered task, so each commit is easy to review and revert.

### 1. CI first

- `.github/workflows/ci.yml`: add `milestone/**` to `on.push.branches` and
  `on.pull_request.branches`. Without it, nothing on the milestone branch is checked.

### 2. Remove the harness and eval packages

- Delete `packages/evals`, `packages/harnesses/browser-nano`, `packages/harnesses/browser-coding`.
- `pnpm-workspace.yaml`: remove `packages/evals` and `packages/harnesses/*`.
- Root `package.json`: remove `test:eval:smoke`, `test:eval:matrix`, `test:eval:matrix:coding`,
  `test:eval:matrix:coding:anthropic`, `eval:matrix:chrome`, `eval:matrix:chrome:smoke`.
- `vitest.config.mts`: remove the `eval` and `eval-browser` projects.
- Delete `.github/workflows/evals.yml`.
- `scripts/list-publishable-workspaces.test.ts`: update fixtures that name these packages.

### 3. Remove extensions, vendor packages and policies

Per §5.4:

- Delete `packages/extensions/format-eql`, `chrome-ai`, `memory`, `telemetry`, `index`,
  `storage`, `browser-secrets`.
- Delete `packages/vendor/slack`, `packages/runtimes/temporal`.
- Delete `packages/policies/src/image-policy.ts`, `image-policy-eval.ts`,
  `packages/policies/test/image-policy.test.ts`, and their exports in `policies/src/index.ts`.
- Model providers: delete the `evaluate` capability (an eval judge for harness outputs) from
  `extensions/anthropic`, `extensions/openai` and `extensions/ollama`, with its prompts and
  tests. Each keeps `generate`; Ollama also keeps `listModels`. Remove "harness" wording from
  their metadata.

### 4. Remove harness code from `types` and `core`

- `packages/types/src`: delete `harness.ts`, `harness-feedback.ts`, `harness-reply.ts`,
  `harness-run-context.ts`, `harness-tasks.ts`, `intent.ts`, `probe-context.ts` and their
  exports. Keep `model.ts` (the providers use `modelGenerateInputSchema` and
  `modelGenerateOutputSchema`), but drop its harness-only types and `@category Harness` tags.
- `packages/core/src`:
  - Delete `harness/**`.
  - Delete `compile/compile-harness-artifact.ts`, `evaluate-harness-artifact.ts`,
    `extract-harness-artifact.ts`, `evaluate-browser.ts`, `prepare-browser-source.ts`.
  - Delete `feedback/`, `testing/test-model-generate.ts`.
  - Delete `encoding/strip-harness-typescript-output.ts`, `strip-markdown-fences.ts`,
    `utility-context.ts`.
  - Delete `bindings/harness.ts`, `validate/harness.ts`.
  - `environment/environment.ts`: remove `withHarnesses` and harness resolution.
  - Remove harness error codes (`ECP_HARNESS_ERROR_CODES`, `HARNESS_CAPABILITY_NOT_A_STEP`,
    `UNKNOWN_HARNESS*`) and the harness exports from `index.ts`, `browser.ts` and `node.ts`.
- Remove the `browser()` config placeholder (`helpers/browser.ts`, `BrowserValue`,
  `BROWSER_SECRETS_RESOLVER_ID` in `environment/config-resolver.ts`). Its only resolver was
  `browser-secrets`. `env()` and `secrets()` stay.
- `packages/core/package.json`: drop the `@executioncontrolprotocol/browser-secrets` dev
  dependency.

### 5. Trim the browser runtime

- `packages/runtimes/browser/src`: delete `authoring/`, `extensions/browser-guide.ts`,
  `extensions/browser-session-config.ts`. Keep the executor, builtins, `browser-registry` and
  `browser-local-config`.
- `packages/runtimes/browser/package.json` and `tsconfig.json`: drop the dependencies on
  `harnesses-browser-nano`, `format-eql`, `chrome-ai`, `browser-secrets`.

### 6. Trim the CLI

- Delete commands `test.ts`, `test/*`, `serve.ts`, `up.ts`, `encode.ts`, `decode.ts`.
- Delete `src/lib/up/*`, `src/lib/http/*`, `src/lib/test-session-io.ts`.
- `packages/cli/package.json`: drop `extension-ollama` and `extension-storage`.
- Root `package.json`: remove `dev:demo`, `up:demo`, `build:demo`, `test:demo`. Delete
  `scripts/ecp-up-demo.mjs`.

### 7. Move the demo out

- Delete `apps/browser-demo` and `packages/extensions/format-reactflow`. Both come back from
  `pre-reset` in Phase 8.
- Delete `.github/workflows/pages.yml` (the docs repo deploys the docs).
- `ci-pipeline.yml`: remove the `demo` job. Keep the `browser` job, which tests core in a
  browser.

### 8. Examples, docs and root files

- Delete `examples/04-compile-and-run`, `04-encode-decode`, `05-test-session`, `harness-ollama`,
  `controller-specialist`, `vendor/browser-demo-host`, `vendor/02-weekly-brief-with-slack`.
- `examples/02-weekly-brief`: replace the `memory.search` step with workflow input, so it no
  longer needs `memory`. (Full conversion to a single-file workflow is Phase 4.)
- `examples/vendor/04-image-prep`: remove the `image-policy` binding.
- Delete everything under `docs/` (the docs site lives in the `docs` repo), `ecp-overhaul.md`,
  `archive/`, `config/`, `.gitmodules`, `.cursor/eval-timing.ndjson`,
  `skills/ecp-core/references/harness-eval.md`, `scripts/migrate-deps-to-pnpm.mjs`.
- `.gitignore`: add `.ecp/` (run journals, Phase 4).

### 9. Make it green

Known breakages from the removals (found by searching surviving code for imports of the
removed packages):

| File | Fix |
| --- | --- |
| `core/test/harness/**` (32 files) | Delete with the harness |
| `core/test/feedback/**` | Delete |
| `core/test/weekly-brief.test.ts` | Rewrite against the `02-weekly-brief` example without `memory` |
| `core/test/browser-secret-serialization.test.ts` | Delete |
| `core/test/env-resolution.test.ts` | Remove the `browser()` cases; keep `env()` and `secrets()` |
| `core/test/fluent-api.test.ts` | Remove `browser()` placeholder cases |
| `core/test/testing/test-extension.test.ts` | Drop the `format-eql` dependency |
| `runtimes/browser/test/authoring-service.test.ts`, `guide-chat.test.ts`, `vite-browser-prompts-plugin.test.ts` | Delete |
| `runtimes/browser/test/browser-runtime.test.ts` | Remove the `chrome-ai` cases |
| `runtimes/browser/test/browser/browser-secrets.test.ts` | Delete |
| `cli/test/up/**` | Delete |
| `examples/harness-ollama/environment.ts` | Deleted in task 8 |

Then:

- `tsconfig.build.json` and per-package `tsconfig.json` references: remove deleted packages.
- `pnpm install` to refresh the lockfile.
- Run `pnpm run check` until it passes.

## Verification

- `pnpm run build`, `pnpm run lint`, `pnpm run test:unit`, `pnpm run test:integration`,
  `pnpm run test:e2e` and the browser project all pass locally and in CI on the PR.
- `grep -ri "harness\|eql\|chrome-ai\|browser-secrets" packages --include=*.ts` returns only
  intentional mentions (for example a changelog), and no imports.
- Record TypeScript line counts before and after in the PR description. Expected: about
  83K → about 50K.

## Exit criteria

- [ ] CI runs on `milestone/**` and is green on the PR.
- [ ] Every item in §5.7 marked for Phase 1 is gone.
- [ ] No harness, eval, EQL, demo, `browser()` placeholder or `evaluate` capability remains.
- [ ] `test-session` still exists and its tests pass.
- [ ] Phase status updated in `reset/README.md` and `RESET-PLAN.md` §7.

## Risks

| Risk | Mitigation |
| --- | --- |
| Hidden coupling: core code imports harness types in non-obvious places | Delete the `harness` types first and let `tsc -b` list every break |
| Coverage gate drops after deleting well-tested harness code | Coverage is measured on what remains; adjust thresholds only if the remaining code's own coverage is unchanged, and say so in the PR |
| Deleting `docs/` loses useful notes | Everything is at `pre-reset`; anything still relevant moves to the docs repo in Phase 6 |
