---
name: ecp-core
description: >-
  Contributes to the ECP monorepo during the realignment milestone (ECP host,
  execution manifest v2, plugins, MCP relay, CLI, App). Use when planning or
  executing a realignment phase, writing the Phase 0 build spec, porting legacy
  code, or writing plugins. Not for authoring executions with the published
  0.52 CLI (use the docs ecp skill for that).
---

# ECP core monorepo (realignment)

This skill is for **working inside this repository** on `milestone/realignment`.

## Start here

1. `REALIGNMENT-PLAN.md`: decisions, architecture, vocabulary, diagrams. Source of truth.
2. `realignment/README.md` and the phase doc you were asked to execute.
3. `AGENTS.md` and `.cursor/rules/`: rules for working in the repo.
4. The CLI reset plan is retired; what still applies is in the plan's "Carried over from the
   CLI reset" section.

**No implementation code before Phase 0 (the build spec) is done.**

## Progressive disclosure

- `references/package-boundaries.md`: target components and boundaries, and what each legacy
  package becomes
- `references/extension-authoring.md`: the plugin contract (capabilities only)
- `references/examples.md`: legacy examples and their role as v2 fixtures

## Quick commands (legacy code)

```sh
pnpm install
pnpm run build
pnpm run check
pnpm run test:unit
```

All workspace packages use `workspace:*` / `workspace:^` dependencies. Never add `file:` links.
Open PRs into `milestone/realignment`. Never push to `main` (publishes to npm) or `development`.
