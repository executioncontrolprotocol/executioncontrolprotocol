# Dogfood A task 1 — JSONata reshape (local proof)

One local pass with the in-repo CLI (`node packages/cli/bin/run.js`), not `@next`. Hermetic
`ECP_DATA_DIR` / `ECP_CONFIG_DIR` under `%TEMP%\ecp-dogfood-phase6`. Plugin linked with
`ecp plugins link plugins/plugin-jsonata --no-install` (`ECP_ALLOW_SOURCE=path`).

This is **not** a fresh Claude Code session. The 3×3 matrix is operator follow-up.

## Prompt

Reshape `{ items: [{ title }, ...] }` into `{ title, count }` with JSONata and save the
result. Start from a wrong path.

## Commands

```bash
node packages/cli/bin/run.js run reset/dogfood/01-reshape.fail.ecp.ts --json
node packages/cli/bin/run.js run reset/dogfood/01-reshape.ecp.ts --json
```

## Injected failure

`01-reshape.fail.ecp.ts` uses `$assert($exists(payload.export.summary), "wrong path")`.

`--json` returned `ok: false`, `code: ECP_STEP_FAILED`,
`message: JSONata evaluation failed: [object Object]`.

## Recovery

Switch to `01-reshape.ecp.ts` with
`{ "title": items[0].title, "count": $count(items) }` (the payload is the JSONata root;
`payload.items` is the wrong path).

`--json` returned `ok: true`, `run.status: completed`,
`state.summary.result: { "title": "Widget", "count": 2 }`
(run id `5a527b37-a7d6-472c-ac92-7797da78e7d4`).

## Stuck points

The first success attempt used `payload.items[0].title` and completed with `result: {}`
because JSONata treated `payload` as missing on the root. Fixing the expression against
`items` recovered without changing the CLI.
