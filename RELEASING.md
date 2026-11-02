# Releasing to npm

Packages are versioned independently with [Changesets](https://github.com/changesets/changesets). `baseBranch` is `development`. In-repo plugin `peerDependencies` stay `workspace:^` until publish.

## Branches

- **`development`** — Default branch after the reset. PRs here get a Changesets status check.
- **`milestone/cli-reset`** — Reset work. Keep it after the 0.50.0 field-test for a later 1.0.
- **`main`** — Publishes `latest` when `ENABLE_NPM_PUBLISH` is `true`. Phase 9 field-test is
  **0.50.0**, not 1.0.0. Do not reuse the existing `v1.0.0` tag (`a938230`).
- **`feat/**`** — Feature branches. Open PRs into `milestone/cli-reset` until the field-test
  merge path; then into `development`.

## Latest (Phase 9 field-test)

Changesets pre mode (`next` / `1.0.0-next.0`) is **off**. Packages are **0.51.0**. CLI
`oclif.jitPlugins` pins `mcp` and `plugin-app` at `^0.51`.

1. Merge to `main` with `ENABLE_NPM_PUBLISH=true`.
2. The `publish` job in `ci-pipeline.yml` runs `changesets/action` → `changeset publish` to
   **`latest`**.
3. Do **not** dispatch [`release-next.yml`](.github/workflows/release-next.yml) for this
   release. Do **not** bump to 1.0.0 here. 1.0 (deprecate 0.14 names, archives, live dogfood)
   is Later.

## Adding a changeset

```bash
pnpm exec changeset
```

Commit the file under `.changeset/`. Independent versioning means each package can move on its own. A `major` bump from 0.50.0 becomes 1.0.0 — do not add one until the 1.0 release.

## Smoke

`pnpm run test:plugin-pack` packs `core`, `node`, `plugin-sdk`, `cli`, and every plugin, installs the CLI into a hermetic prefix, then `ecp plugins install <tarball>` for each plugin. After 0.50.0 is on the registry, criterion 1 is `npm i -g @executioncontrolprotocol/cli` then `ecp plugins install jsonata`.
