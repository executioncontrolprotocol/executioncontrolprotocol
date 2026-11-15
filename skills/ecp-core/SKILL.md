---
name: ecp-core
description: >-
  Contributes to the ECP monorepo MVP (host, execution manifest v2, plugins, MCP
  relay, CLI, App). Use when planning or executing a realignment phase,
  implementing the MVP build spec, or writing plugins. Not for the old 0.52
  consumer CLI (use the docs ecp skill for that).
---

# ECP core monorepo

This skill is for **working inside this repository** on `milestone/realignment` and
`feat/realignment-*` branches.

## Start here

1. `realignment/spec/README.md` — MVP build spec (exact contracts). Wins over everything else.
2. `REALIGNMENT-PLAN.md` — decisions, architecture, vocabulary, diagrams.
3. `realignment/README.md` and the phase doc you were asked to execute.
4. `AGENTS.md` and `.cursor/rules/` — rules for working in the repo.
5. `ARCHITECTURE.md` / `SETUP.md` — shipped package layout and local setup.

**Build from `realignment/spec/`**; change the spec first if a contract must change.

## Progressive disclosure

- `references/package-boundaries.md` — MVP packages and boundaries
- `references/extension-authoring.md` — plugin contract (`plugins/plugin-test` is the reference)
- `references/examples.md` — v2 examples and fixtures

## Quick commands

```sh
pnpm install
pnpm run build
pnpm run check
pnpm run test:unit
pnpm run test:e2e
pnpm run test:app
```

All workspace packages use `workspace:*` / `workspace:^`. Never add `file:` links.
Open PRs into `milestone/realignment`. Never push to `main` (publishes to npm) or `development`.
