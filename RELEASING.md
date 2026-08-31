# Releasing to npm

## Branches

- **`development`** — Open PRs here first. CI runs **version vs npm**: every non-private workspace package must use the **same** version, and that version must be **strictly greater** than the latest version on npm for each package (`npm run version:check-vs-npm`).
- **`main`** — After CI passes (build, lint, unit, integration, browser), **`npm run publish:workspaces`** publishes all non-private `@executioncontrolprotocol/*` packages to npm in dependency order (skips versions already on the registry).

## Bump versions (all workspaces)

```bash
npm run version:bump -- 0.13.0
```

Commit the version changes on `development`, then merge to `main` when ready to publish.

Check locally (same as development CI):

```bash
npm run version:check-vs-npm
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

Run **`npm run build`** and **`npm run generate:schema`** from the repo root before a manual release; CI does this in the publish job. Packages ship compiled **`dist/`** JS.

**Node:** use **≥ 22** locally and in CI.

## GitHub secret

Configure **`NPM_TOKEN`** on the repository (Settings → Secrets and variables → Actions) with publish access for the `@executioncontrolprotocol` org/scope. The publish job only runs on **push to `main`**.
