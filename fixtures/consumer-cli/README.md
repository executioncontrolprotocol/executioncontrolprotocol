# Plugin pack smoke fixture

Isolated **non-workspace** sources used by `scripts/plugin-pack-smoke.mjs`.

The smoke packs `core`, `node`, `plugin-sdk`, `cli`, and every `plugins/plugin-*` tarball, installs the CLI into a temp prefix with hermetic `ECP_DATA_DIR` / `ECP_CONFIG_DIR`, then `ecp plugins install <file-url>` for each plugin (`ECP_ALLOW_SOURCE=path`, `ECP_TRUST_THIRD_PARTY=1`).

First-party npm is still unpublished, so this proves install from packed tarballs rather than `npm i -g @executioncontrolprotocol/cli@next`.

## Run

From the monorepo root (after `pnpm run build`):

```sh
pnpm run test:plugin-pack
```

Set `KEEP_PLUGIN_PACK=1` to leave the temp install directory.

## Layout

| File | Role |
| --- | --- |
| `workflow.ecp.ts` | Minimal Fluent echo workflow (packed CLI compile/validate/run) |
| `payload.json` in `fixtures/plugin-pack-smoke/` | Offline jsonata `--json` input |
| `package.json` | Documents required deps (smoke script installs from tarballs) |
