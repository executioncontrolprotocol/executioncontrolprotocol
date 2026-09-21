# Releasing to npm

## Branches

- **`development`** — Open PRs here first. CI runs **version vs npm**: every non-private workspace package must use the **same** version, and that version must be **strictly greater** than the latest version on npm for each package (`pnpm run version:check-vs-npm`).
- **`main`** — After CI passes (build, lint, unit, integration, browser), **`pnpm run publish:workspaces`** publishes all non-private `@executioncontrolprotocol/*` packages to npm in dependency order (skips versions already on the registry).

## Merge and publish order

Publish from this monorepo only:

1. Bump versions (`pnpm run version:bump`).
2. Merge `development` → `main`.
3. CI `publish:workspaces` publishes every non-private package under `packages/`, including `packages/vendor/*`.
4. GitHub Pages builds [`apps/browser-demo`](apps/browser-demo) from the same commit. The demo package is private and is not published.

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

Configure **`NPM_TOKEN`** on the repository (Settings → Secrets and variables → Actions) with publish access for the `@executioncontrolprotocol` org/scope. The publish job only runs on **push to `main`**.
