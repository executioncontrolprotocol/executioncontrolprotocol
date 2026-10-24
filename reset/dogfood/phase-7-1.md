# Dogfood B task 1 — JSONata reshape (local MCP SDK proof)

One local pass with `ecp mcp serve` over stdio (MCP SDK `Client` + `StdioClientTransport`),
not Claude Desktop and not `@next`. Hermetic `ECP_DATA_DIR` under `%TEMP%\ecp-dogfood-phase7-*`.
Linked `packages/mcp` and `plugins/plugin-jsonata`. Runner: `reset/dogfood/phase-7-mcp-client.mjs`.

This is **not** a Claude Desktop session. The 3×3 Desktop matrix is operator follow-up.

## Prompt

Reshape `{ items: [{ title }, ...] }` into `{ title, count }` with JSONata and save the
result. Start from a wrong path.

## Tools

```text
ecp_run { path: reset/dogfood/01-reshape.fail.ecp.ts }
ecp_run { path: reset/dogfood/01-reshape.ecp.ts }
```

`jsonata_transform` was present in `tools/list`.

## Injected failure

`01-reshape.fail.ecp.ts` uses `$assert($exists(payload.export.summary), "wrong path")`.

The meta tool returned `{ ok: true, data.run.status: "failed" }` (MCP wraps the run envelope;
it does not flip the CLI `{ ok: false }` gate). `history.reshape.diagnostics[0].code` was
`ECP_STEP_FAILED`, message `JSONata evaluation failed: [object Object]`.
Run id `c1f9d801-122e-4e1d-a111-baacaf334bcd`.

## Recovery

`01-reshape.ecp.ts` with `{ "title": items[0].title, "count": $count(items) }`.

`data.run.status: completed`, `state.summary.result: { "title": "Widget", "count": 2 }`.
Run id `cea386fd-1522-4d6a-8580-5e2b9b1ea254`.

## Stuck points

None beyond the injected JSONata path. Same recovery as Phase 6 CLI dogfood.
