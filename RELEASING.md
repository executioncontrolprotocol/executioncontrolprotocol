# Releasing to npm

## Branches

- **`development`** — Open PRs here first. CI runs **version vs npm**: every non-private workspace package must use the **same** version, and that version must be **strictly greater** than the latest version on npm for each package (`pnpm run version:check-vs-npm`).
- **`main`** — After CI passes (build, lint, unit, integration, browser, demo), npm publish runs **only when** the repository variable **`ENABLE_NPM_PUBLISH`** is set to `true`. Otherwise merges to `main` build/test only (no npm deploy).
- **`feat/**`** — Push CI runs the same build/test pipeline (no publish). Open PRs into `development` or `main` as usual.

## Merge and publish order

Publish from this monorepo only, and only when you intend a release:

1. Bump versions (`pnpm run version:bump`).
2. Merge `development` → `main` (CI always builds and tests).
3. To publish: set Actions variable **`ENABLE_NPM_PUBLISH=true`**, then push/merge to `main` (or re-run the publish job). CI runs **`pnpm run publish:workspaces`** for every non-private package under `packages/`, including `packages/vendor/*` (skips versions already on the registry). Clear or set the variable back to `false` afterward if you want main merges to stay publish-silent.
4. GitHub Pages builds [`apps/browser-demo`](apps/browser-demo) from `main` separately (not npm). The demo package is private and is not published.

External authors depend on the published npm versions. `pnpm run test:vendor-pack` checks that a vendor package typechecks against packed core and types.

## Bump versions (all workspaces)

```bash
pnpm run version:bump -- 0.14.0
```

Commit the version changes on `development`, then merge to `main` when ready to publish.

Check locally (same as development CI):

```bash
pnpm run version:check-vs-npm
```

## Published packages (`@executioncontrolprotocol/*`)

All non-private packages under `packages/` (including protocol/platform `extensions/*`, vendor `vendor/*`, `runtimes/*`, and `harnesses/*`). `@executioncontrolprotocol/evals` and `apps/browser-demo` stay private and are not published.

Vendor package names are listed in [`packages/vendor/README.md`](packages/vendor/README.md).

Core surface:

- `@executioncontrolprotocol/types` — protocol types and generated JSON Schemas (`dist/schemas/`)
- `@executioncontrolprotocol/core` — fluent API, environment, local runtime
- `@executioncontrolprotocol/cli` — `ecp` Oclif CLI
- `@executioncontrolprotocol/node`, `@executioncontrolprotocol/browser` — runtime hosts
- `@executioncontrolprotocol/policies`, `@executioncontrolprotocol/mcp`, format/extension packages, and harness packages as needed

Run **`pnpm run build`** and **`pnpm run generate:schema`** from the repo root before a manual release; CI does this in the publish job. Packages ship compiled **`dist/`** JS.

**Node:** use **≥ 22** locally and in CI.

## GitHub secret

Configure **`NPM_TOKEN`** on the repository (Settings → Secrets and variables → Actions) with publish access for the `@executioncontrolprotocol` org/scope. The publish job runs only on **push to `main`** when **`ENABLE_NPM_PUBLISH`** is `true` (Actions variable). Leave that variable unset/`false` during monorepo cutover and routine merges.
