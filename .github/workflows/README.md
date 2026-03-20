# GitHub Actions workflows

| File | Purpose |
| ---- | ------- |
| **`ci.yml`** | Workflow `ci`: runs on pushes to `main` / `development` and on PRs targeting those branches. Calls `ci-pipeline.yml`. |
| **`ci-pipeline.yml`** | Reusable workflow `ci`: jobs `build`, `unit`, `integration`, `e2e`; **publish** on **push to `main`** only. |
| **`development.yml`** | Workflow `devversion`: on `development` (push + PR), checks workspace versions are above published npm (job `version`). |
| **`evals.yml`** | Daily / manual **eval** runs: installs Ollama, pulls `gemma3:1b` (or dispatch input), runs `examples/single-executor` and `examples/controller-specialist` with `--provider ollama`. |

To run the full quality gate locally: `npm run build`, `npm run lint`, `npm run validate`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`.

**E2E on GitHub Actions:** The `e2e` job runs **Ollama in Docker** (`ollama/ollama`) so the runner does not run `install.sh` (slow, root-owned paths). Model blobs live in `.ollama-models/`, are **cached** with `actions/cache`, and are **bind-mounted** into the container (`OLLAMA_MODELS=/models`). `docker exec … ollama pull` runs only on cache miss. Bump the `…-v1` cache key when changing the pinned model. **Evals** use the same pattern.
