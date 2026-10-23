# Consumer CLI fixture

Isolated **non-workspace** project that mimics a greenfield consumer of `@executioncontrolprotocol/cli` and related packages.

It is **not** listed in the pnpm workspace. In-repo `examples/` and workspace `pnpm install` hide pack/install resolution bugs; this fixture does not.

## Run

From the monorepo root (after `pnpm run build`):

```sh
pnpm run test:consumer-cli
```

That packs the required workspace packages, installs them into a fresh temp directory with these sources, then runs `ecp compile`, `validate`, and `run` on a single workflow file (no `--env`).

Set `KEEP_CONSUMER_CLI=1` to leave the temp install directory for inspection.

## Layout

| File | Role |
| --- | --- |
| `workflow.ecp.ts` | Minimal Fluent echo workflow |
| `package.json` | Documents required deps (smoke script installs from tarballs) |
