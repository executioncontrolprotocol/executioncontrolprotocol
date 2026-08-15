---
name: ecp-core
description: >-
  Contributes to the ECP Fluent API monorepo (types, core, runtimes, CLI, MCP,
  policies, first-party extensions, harnesses). Use when changing package
  boundaries, compile subpaths, hosts vs extensions, harness/eval integrity, or
  monorepo check commands — not for everyday consumer Fluent authoring (use the
  docs ecp skill instead).
---

# ECP core monorepo

Install: `npx skills add executioncontrolprotocol/executioncontrolprotocol --skill ecp-core -y`

Consumer Fluent / CLI / secrets stay on the docs skill (`npx skills add https://executioncontrolprotocol.io`). This skill is for **working inside this repository**.

Also respect local `AGENTS.md` and `.cursor/rules/` when the clone is already open.

## Progressive disclosure

- `references/package-boundaries.md` — hosts, compile subpaths, apps
- `references/extension-authoring.md` — first-party / third-party parity
- `references/harness-eval.md` — harnesses and eval integrity
- `references/examples.md` — `examples/` skill map

## Quick commands

```sh
npm install
npm run build
npm run check
npm run test:unit
```

CLI after build: `npm start -w @executioncontrolprotocol/cli` or `npm link` in `packages/cli`.
