# GitHub Actions workflows

| File | Purpose |
| ---- | ------- |
| **`ci.yml`** | Workflow `ci`: runs on pushes to `main` / `development` and on PRs targeting those branches. Calls `ci-pipeline.yml`. |
| **`ci-pipeline.yml`** | Reusable workflow `ci`: jobs `build`, `unit`, `integration`, `e2e`; **publish** on **push to `main`** only. |
| **`development.yml`** | Workflow `devversion`: on `development` (push + PR), checks workspace versions are above published npm (job `version`). |
| **`evals.yml`** | Manual / scheduled evaluation runs (optional; separate from CI). |

To run the full quality gate locally: `npm run build`, `npm run lint`, `npm run validate`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`.
