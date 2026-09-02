# Releasing to npm

## Branches

- **`development`** — Open PRs here first. CI runs **version vs npm**: every non-private workspace package must use the **same** version, and that version must be **strictly greater** than the latest version on npm for each package (`pnpm run version:check-vs-npm`).
- **`main`** — After CI passes (build, lint, unit, integration, browser), **`pnpm run publish:workspaces`** publishes all non-private `@executioncontrolprotocol/*` packages to npm in dependency order (skips versions already on the registry).

## Merge and publish order

When releasing a coordinated change across repos:

1. **Core** (`executioncontrolprotocol`) — bump, merge `development` → `main`, publish
2. **Extensions** ([extensions](https://github.com/executioncontrolprotocol/extensions)) — bump peer ranges, merge, publish
3. **Browser demo** ([browser-demo](https://github.com/executioncontrolprotocol/browser-demo)) — bump dependency ranges, merge (Pages deploy from `main` uses registry only)

Consumer repos on `development` link unpublished core via `pnpm run link:ecp`; on `main` they install from npm.

## Bump versions (all workspaces)

```bash
pnpm run version:bump -- 0.13.2
```

Commit the version changes on `development`, then merge to `main` when ready to publish.

Check locally (same as development CI):

```bash
pnpm run version:check-vs-npm
```

## Published packages (`@executioncontrolprotocol/*`)

All non-private packages under `packages/` (including protocol/platform `extensions/*`, `runtimes/*`, and `harnesses/*`). `@executioncontrolprotocol/evals` stays private and is not published.

**Vendor extensions** publish from the sibling
[extensions](https://github.com/executioncontrolprotocol/extensions) repo
(independent versioning; not included in this repo’s `publish:workspaces`). See that repo’s
[package list](https://github.com/executioncontrolprotocol/extensions#packages) — do not maintain a
vendor inventory here.

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
