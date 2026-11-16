# Releasing to npm

Packages are versioned independently with [Changesets](https://github.com/changesets/changesets).
`baseBranch` is `development`. In-repo dependencies stay `workspace:*` / `workspace:^` until
publish.

**Phase 9 did not publish.** This file is the checklist for the first MVP release from
`development`/`main` after the merged milestone (PR #68, 2026-11-15).

## Branches

| Branch | Role |
| --- | --- |
| `development` | Default integration branch. |
| `main` | Publishes `latest` when `ENABLE_NPM_PUBLISH` is `true`. |
| `fix/*` / `feat/*` | Feature and fix PRs into `development`. |
| `milestone/realignment` | Historical: merged into `development` via PR #68. |

Never push feature work straight to `main`.

## Release tag naming

Do **not** use `v1.0.0` for the first MVP npm cut (that tag already exists in history for an
unrelated cut).

**Chosen scheme:** calendar MVP tags — `mvp-YYYY.MM.DD` (example: `mvp-2026.11.15`).

- Git tag: `mvp-YYYY.MM.DD`
- npm package versions: independent majors from Changesets (first publish of each new package
  may start at `1.0.0` or the next major after any prior 0.x name reuse — decide per package at
  publish time)
- Changelog / GitHub Release title: `MVP YYYY.MM.DD`

## MVP package set (publish candidates)

| Package | Role |
| --- | --- |
| `@executioncontrolprotocol/protocol` | Types and schemas |
| `@executioncontrolprotocol/engine` | Executor and operations |
| `@executioncontrolprotocol/quickjs` | Expression engine |
| `@executioncontrolprotocol/local` | Disk storage, secrets, plugin registration |
| `@executioncontrolprotocol/formatters` | JSON / TOON |
| `@executioncontrolprotocol/host` | Host process |
| `@executioncontrolprotocol/cli` | `ecp` CLI |
| `@executioncontrolprotocol/mcp-relay` | MCP three-tool relay |
| `@executioncontrolprotocol/app` | Visual App bundle |
| `@executioncontrolprotocol/plugin-sdk` | Plugin authoring |
| `@executioncontrolprotocol/plugin-test` | Harness plugin |
| `@executioncontrolprotocol/plugin-anthropic` | Anthropic |
| `@executioncontrolprotocol/plugin-azure-blob-storage` | Azure Blob |
| `@executioncontrolprotocol/plugin-adobe-firefly-services` | Firefly Services |

Before the first publish: clear `private: true` on the packages that should go to npm, run
`pnpm exec changeset version` from the Phase 9 majors changeset, then
`changeset publish` from `main` with `ENABLE_NPM_PUBLISH=true`.

## 0.x packages to `npm deprecate`

Point consumers at the replacements. Exact deprecation messages can be refined at publish time.

| 0.x package | Replacement |
| --- | --- |
| `@executioncontrolprotocol/core` | `@executioncontrolprotocol/protocol` + `@executioncontrolprotocol/engine` |
| `@executioncontrolprotocol/environments` / `@executioncontrolprotocol/node` | `@executioncontrolprotocol/host` + `@executioncontrolprotocol/local` |
| `@executioncontrolprotocol/cli` (0.5x) | `@executioncontrolprotocol/cli` (MVP major) — breaking; see README |
| `@executioncontrolprotocol/mcp` | `@executioncontrolprotocol/mcp-relay` |
| `@executioncontrolprotocol/plugin-sdk` (0.x) | `@executioncontrolprotocol/plugin-sdk` (MVP major) |
| `@executioncontrolprotocol/plugin-app` | Built into `@executioncontrolprotocol/app` + `ecp app` |
| `@executioncontrolprotocol/plugin-format-toon` | `@executioncontrolprotocol/formatters` (host service, not a plugin) |
| `@executioncontrolprotocol/plugin-jsonata` / other unported plugins | Stay deprecated until ported, or removed from docs |

Example:

```bash
npm deprecate @executioncontrolprotocol/core@"<1.0.0" "Replaced by @executioncontrolprotocol/protocol and @executioncontrolprotocol/engine (MVP)."
```

## Checklist (no publish in Phase 9)

- [x] Changeset majors recorded (`.changeset/mvp-realignment-majors.md`)
- [x] Tag scheme decided (`mvp-YYYY.MM.DD`)
- [x] Deprecation list documented
- [ ] Packages marked public where needed
- [ ] `changeset version` + CI green on release branch
- [ ] Publish from `main` with `ENABLE_NPM_PUBLISH=true`
- [ ] `npm deprecate` for 0.x names
- [ ] GitHub Release for `mvp-YYYY.MM.DD`

## Adding a changeset

```bash
pnpm exec changeset
```

Commit the file under `.changeset/`. Independent versioning means each package can move on its
own.
