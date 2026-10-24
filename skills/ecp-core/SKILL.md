---
name: ecp-core
description: >-
  Contributes to the ECP monorepo (core, environments, CLI, MCP, plugin SDK,
  plugins) during and after the CLI reset. Use when executing a reset phase,
  changing package boundaries, writing extensions or plugins, or running the
  monorepo checks. Not for everyday workflow authoring (use the docs ecp skill
  instead).
---

# ECP core monorepo

Install: `npx skills add executioncontrolprotocol/executioncontrolprotocol --skill ecp-core -y`

This skill is for **working inside this repository**. Consumer workflow authoring uses
`npx skills add executioncontrolprotocol/docs` (`skills/ecp/` on docs `main`).

## Start here

1. `AGENTS.md` and `.cursor/rules/`: the code as it is now, plus conventions. Phase 1
   removals (harnesses, evals, EQL, demo) are gone; don't reintroduce them.
2. 1.0 leftovers live in `reset/later.md`. Cut work from `development`.
3. `RESET-PLAN.md` and `reset/phase-<n>-*.md` are the completed reset record.

## Progressive disclosure

- `references/package-boundaries.md`: core, environments, hosts, now and after the reset
- `references/extension-authoring.md`: extension and plugin contract, now and after the reset
- `references/examples.md`: what's in `examples/` and what changes
- Harnesses and evals were removed in Phase 1 (`pre-reset` has the old `harness-eval.md`)

## Quick commands

```sh
pnpm install
pnpm run build
pnpm run check
pnpm run test:unit
pnpm run test:plugin-pack
```

**Monorepo dev:** `pnpm --filter @executioncontrolprotocol/cli start`, or `pnpm link --global`
from `packages/cli/` after `pnpm run build`.

All workspace packages use `workspace:*` / `workspace:^` dependencies. Never add `file:` links.
Open PRs into `development`. Pushes to `main` publish to npm.
