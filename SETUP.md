# ECP Setup Guide

Build and run the MVP packages in this monorepo.

## Prerequisites

- **Node.js** 22+
- **pnpm** 10 (`corepack enable`; see `packageManager` in root `package.json`)

## Install and build

```bash
git clone https://github.com/executioncontrolprotocol/executioncontrolprotocol.git
cd executioncontrolprotocol
corepack enable
pnpm install
pnpm run build
```

Always run `pnpm install` from the repo root.

## CLI

After build, run the local binary:

```bash
node packages/cli/bin/ecp.js --help
```

Or link it globally for a short `ecp` command:

```bash
cd packages/cli && pnpm link --global && cd ../..
ecp --help
```

## Link a plugin and run

```bash
ecp host start
ecp plugins link plugins/plugin-test --no-install
ecp retrieve --type capability --query echo --json
ecp execute fixtures/manifests/runs/echo.ecp.json --json
```

Examples under `examples/` are v2 JSON executions. See each example's README.

## Checks

```bash
pnpm run check          # build, manifests, lint, secrets, coverage, integration, e2e, app
pnpm run test:unit
pnpm run test:coverage  # coverage gate
pnpm run test:e2e       # includes test/e2e/acceptance/A1–A12
pnpm run test:app       # Playwright A8
pnpm run bench          # budgets in bench/budgets.json
```

## Secrets

```bash
ecp secrets set my.key   # value on stdin
ecp secrets list --json
```

Config objects reference `{ "$secret": "my.key" }`. Executions never contain secret values.

## Related

- [`README.md`](README.md) — MVP quick start
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — package layout
- [`AGENTS.md`](AGENTS.md) — agent rules and commands
- [`realignment/spec/`](realignment/spec/README.md) — contracts
