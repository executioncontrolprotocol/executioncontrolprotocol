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

This skill is for **working inside this repository**. Consumer workflow authoring uses the
docs `ecp` skill (rewritten in reset Phase 6).

## Start here

1. `RESET-PLAN.md`: decisions and target architecture. It takes precedence during the
   milestone.
2. `reset/README.md` and `reset/phase-<n>-*.md`: how phases run, and the task list for each.
3. `AGENTS.md` and `.cursor/rules/`: the code as it is now, plus conventions. Phase 1
   removals (harnesses, evals, EQL, demo) are gone; don't reintroduce them.

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
Never push to `main` or `development` during the milestone.
