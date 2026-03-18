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

## Published packages

- `@executioncontrolprotocol/spec`
- `@executioncontrolprotocol/runtime`
- `@executioncontrolprotocol/cli` — depends on **runtime** (and thus **spec**). All three ship **compiled `dist/`** JS; run **`npm run build`** from the repo root before tests or `npx ecp`.

**Node:** use **≥ 22** locally and in CI (`generate:schema` / `ts-json-schema-generator` requires it).

Granular **NPM_TOKEN** should allow **Publish** on all three packages under `@executioncontrolprotocol`.

## GitHub secret

Configure **`NPM_TOKEN`** on the repository (Settings → Secrets and variables → Actions).

See root README or project docs for token creation steps.
