# Dogfood B task 2 — resize, upload, approve (local MCP SDK proof)

One local pass with `ecp mcp serve` over stdio, not Claude Desktop. Same runner and hermetic
dir as task 1. Linked `plugin-image-sharp`, `plugin-azure-blob-storage`, and `plugin-approval`.

This is **not** a Claude Desktop session.

## Prompt

Resize a product photo, upload it with approval, return a share link. Start from a wrong
`ref()` on the upload step.

## Tools

```text
ecp_run { path: reset/dogfood/02-photo.fail.ecp.ts }
ecp_run { path: reset/dogfood/02-photo.ecp.ts }
```

## Injected failure

`02-photo.fail.ecp.ts` sets `filePath: ref("thumb")`. Resize completed; upload failed.

`data.run.status: failed`, `history.upload.diagnostics[0].code: ECP_STEP_FAILED`, Zod
`invalid_type` (`expected: string`, `received: object`, `path: filePath`).
Run id `03ef9605-ea93-4acc-ae21-6edcb2e25bb0`.

## Recovery

`02-photo.ecp.ts` uses `contentBase64` for the upload input. Resize completed again. Upload
did **not** pause for approval. The process host did not apply the workflow-file
`.with([...])` Azure `connectionString` / approval config (those compile into requirements,
and `ecp_run` on MCP uses the already-initialized host). Upload failed with
`ECP_STEP_FAILED`: `Azure Blob Storage requires connectionString or accountName+accountKey in extension config`.
Run id `95e01723-d36b-48bc-8869-1ece9b79dcc4`.

## Stuck points

Phase 6 CLI reached `ECP_RUN_PAUSED` on the fixed graph. MCP `ecp_run` did not re-layer
workflow-file extension config, so this proof stops at missing Azure config instead of
approval escalation. Do not claim Desktop approval or a live Azure upload.
