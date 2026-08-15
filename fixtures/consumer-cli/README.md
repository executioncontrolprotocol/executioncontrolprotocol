# Consumer CLI fixture

Isolated **non-workspace** project that mimics a greenfield consumer of `@executioncontrolprotocol/cli` and related packages.

It is **not** listed in the monorepo `workspaces` array. In-repo `examples/` and workspace `npm ci` hide pack/install resolution bugs; this fixture does not.

## Run

From the monorepo root (after `npm run build`):

```sh
npm run test:consumer-cli
```

That packs the required workspace packages, installs them into a fresh temp directory with these sources, then runs `ecp compile`, `validate`, and `run`.

Set `KEEP_CONSUMER_CLI=1` to leave the temp install directory for inspection.

## Layout

| File | Role |
| --- | --- |
| `workflow.ts` | Minimal Fluent echo workflow |
| `environment.ts` | Node environment + test + format-toon |
| `package.json` | Documents required deps (smoke script installs from tarballs) |
