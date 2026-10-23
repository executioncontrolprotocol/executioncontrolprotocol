# Releasing to npm

Packages are versioned independently with [Changesets](https://github.com/changesets/changesets). `baseBranch` is `development`. In-repo plugin `peerDependencies` stay `workspace:^` until publish.

## Branches

- **`development`** — Default branch after the reset. PRs here get a Changesets status check. During the CLI reset, never push `development`.
- **`milestone/**`** — Reset work. `changeset pre enter next` is on. Prereleases, if any, use the `next` dist-tag via `release-next.yml`.
- **`main`** — Phase 9 publishes `latest`. npm publish runs **only when** `ENABLE_NPM_PUBLISH` is `true` **and** the ref is `main`. Leave the variable unset during the reset.
- **`feat/**`** — Feature branches. Open PRs into `milestone/cli-reset` until Phase 9.

## Prereleases (`next`)

The milestone is in Changesets pre mode (`next`). Versions for `core`, `node`, `browser`, `cli`, `plugin-sdk`, and every plugin start at `1.0.0-next.0`. MCP stays `0.14.1` until Phase 7.

To publish prereleases (Phase 9 operator, or a deliberate dispatch):

1. Confirm you are on a `milestone/**` branch.
2. Dispatch [`.github/workflows/release-next.yml`](.github/workflows/release-next.yml). It builds, tests, then `changeset publish --tag next`.
3. Do **not** dispatch it as part of Phase 5. First-party packages may still be unpublished; `pnpm run test:plugin-pack` proves install from packed tarballs.

## Latest (Phase 9)

1. Exit pre mode (`changeset pre exit`) when you are ready for 1.0.0.
2. Merge to `main` with `ENABLE_NPM_PUBLISH=true`.
3. The `publish` job in `ci-pipeline.yml` runs `changesets/action`.

## Adding a changeset

```bash
pnpm exec changeset
```

Commit the file under `.changeset/`. Independent versioning means each package can move on its own.

## Smoke

`pnpm run test:plugin-pack` packs `core`, `node`, `plugin-sdk`, `cli`, and every plugin, installs the CLI into a hermetic prefix, then `ecp plugins install <tarball>` for each plugin. That is the install proof until `@next` exists on the registry.
