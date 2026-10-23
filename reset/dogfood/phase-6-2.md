# Dogfood A task 2 — resize, upload, approve (local proof)

One local pass with the in-repo CLI, not `@next`. Same hermetic `ECP_DATA_DIR` as task 1.
Linked `plugin-image-sharp`, `plugin-azure-blob-storage`, and `plugin-approval`.

This is **not** a fresh Claude Code session.

## Prompt

Resize a product photo, upload it with approval, return a share link. Start from a wrong
`ref()` on the upload step.

## Commands

```bash
node packages/cli/bin/run.js run reset/dogfood/02-photo.fail.ecp.ts --json
node packages/cli/bin/run.js run reset/dogfood/02-photo.ecp.ts --json
```

## Injected failure

`02-photo.fail.ecp.ts` sets `filePath: ref("thumb")` (the resize output is an object).

`--json` returned `ok: false`, `code: ECP_STEP_FAILED`, Zod `invalid_type`
(`expected: string`, `received: object`, `path: filePath`).

The phase table named this `ECP_INPUT_INVALID`. The local CLI reports it as `ECP_STEP_FAILED`
wrapping the Zod issues.

A `ref("thumb.nope")` attempt returned `ECP_REF_UNRESOLVED` instead. Binding
`secrets("azure-blob-storage/connection-string")` failed first with `ECP_SECRET_MISSING`,
so the fixtures use `UseDevelopmentStorage=true` (not a live key).

## Recovery

`02-photo.ecp.ts` uses `contentBase64` for the upload input. Resize ran, then the approval
policy paused the run:

`--json` returned `ok: false`, `code: ECP_RUN_PAUSED`, `message: Approval required`,
suggestion `ecp runs resume fc9dd754-56df-48eb-8000-ce5b4d535037`.

## Stuck points

Did not complete a live Azure upload (no account, and approval requires a human). After
fixing the `ref()`, the next stop is escalation: ask the user to approve, then bind a real
secret. That matches `references/escalation.md`.
