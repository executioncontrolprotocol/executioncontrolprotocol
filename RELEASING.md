# Releasing to npm

## Branches

- **`development`** — Open PRs here first. CI runs **version vs npm**: every non-private workspace package must use the **same** version, and that version must be **strictly greater** than the latest version on npm for each package.
- **`main`** — After CI passes (build, lint, validate, unit, integration, e2e), **spec** → **runtime** → **cli** are published to npm at the versions in `package.json`.

## Bump versions (all workspaces)

```bash
npm run version:bump -- 0.4.0
```

Commit the version changes on `development`, then merge to `main` when ready to publish.

Check locally (same as development CI):

```bash
npm run version:check-vs-npm
```

## Published packages (`@executioncontrolprotocol/*`)

- `@executioncontrolprotocol/types` — protocol types and generated JSON Schemas (`dist/schemas/`)
- `@executioncontrolprotocol/core` — fluent API, environment, local runtime
- `@executioncontrolprotocol/cli` — `ecp` Oclif CLI (`compile`, `validate`, `describe`, `search`, `run`)
- `@executioncontrolprotocol/policies`, `@executioncontrolprotocol/mcp`, and `@executioncontrolprotocol/extension-*` as needed

Run **`npm run build`** and **`npm run generate:schema`** from the repo root before release; packages ship compiled **`dist/`** JS.

**Node:** use **≥ 22** locally and in CI.

Configure **NPM_TOKEN** with publish access for each package namespace you release.

## GitHub secret

Configure **`NPM_TOKEN`** on the repository (Settings → Secrets and variables → Actions).

See root README or project docs for token creation steps.
