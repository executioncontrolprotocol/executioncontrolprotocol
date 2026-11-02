# GitHub Actions workflows

| File | Purpose |
| ---- | ------- |
| **`ci.yml`** | Workflow `ci`: runs on pushes to `main` / `development` / `feat/**` / `milestone/**` and on PRs targeting those branches. Calls `ci-pipeline.yml`. |
| **`ci-pipeline.yml`** | Reusable workflow `ci`: jobs `secrets`, `build`, `unit`, `integration`, `browser`, `consumer-cli` (`test:plugin-pack`); **publish** on **push to `main`** only when `ENABLE_NPM_PUBLISH=true` (`changesets/action`). |
| **`development.yml`** | Workflow `changesets`: on PRs into `development` and `milestone/**`, runs `changeset status`. On push/PR to `development`, job `version` runs `pnpm run version:check-vs-npm` so every publishable package.json is strictly greater than npm latest. |
| **`release-next.yml`** | Manual `workflow_dispatch` on `milestone/**` only: build/test then `changeset publish --tag next`. Do not dispatch for the Phase 9 `latest` publish. |

To run the full quality gate locally: `pnpm run check` (build + lint + **coverage** + integration + e2e). Browser tests: `pnpm run test:browser:install` then `pnpm run test:browser`.

**Coverage gate:** `pnpm run build` does **not** enforce coverage. Pre-commit (`.husky/pre-commit`) and CI job `unit` run `pnpm run test:coverage` against floors in `vitest.config.mts` (ratchet toward 90%; never lower floors to green CI).

**Pre-commit:** `.husky/pre-commit` runs `pnpm install` when lockfiles change and stages `pnpm-lock.yaml` so the lockfile cannot drift from `package.json`, then Secretlint (`lint-staged`), lint, and `pnpm run test:coverage`. CI job `secrets` runs `pnpm run secrets:scan` (working tree) then Gitleaks over full git history (`.gitleaks.toml`). Use env vars / OS keychain / `.env` (gitignored) — never commit live API keys.
