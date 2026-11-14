# Dogfood workflows (legacy, v1)

Three agent-repair tasks from the CLI reset, each with a working workflow and, for two of
them, a version with an injected failure. They're legacy `*.ecp.ts` files (v1). In Phase 0
they become v2 execution fixtures (`realignment/phase-0-build-spec.md`, deliverable 11), and
the failure versions become fixtures for error codes and repair loops.

| Task | Workflow | Injected failure | Expected error |
| --- | --- | --- | --- |
| 1. JSONata reshape | `01-reshape.ecp.ts` | `01-reshape.fail.ecp.ts`: wrong JSONata path | `ECP_STEP_FAILED` |
| 2. Resize, upload, approve | `02-photo.ecp.ts` | `02-photo.fail.ecp.ts`: wrong `ref()` on the upload step | `ECP_REF_UNRESOLVED` |
| 3. Caption + Mermaid | `03-caption.ecp.ts` | Run without the Mermaid formatter/plugin installed | `ECP_PLUGINS_MISSING` |

Notes for conversion:

- Task 2 binds the `approval` policy. Policies are out of scope in the realignment, so the v2
  fixture drops the approval step (or replaces it with a plain step) until policies return.
- Task 3 converts a workflow to Mermaid. In the realignment Mermaid is a `Formatter` service,
  not a capability, so the v2 fixture keeps only the caption step and checks the formatter
  separately.

Agent prompts for these tasks (for later end-to-end runs):

1. Reshape `{ items: [{ title }, ...] }` into `{ title, count }` with JSONata and save the
   result. Start from a wrong path.
2. Resize a product photo, upload it, return a share link. Start from a wrong `ref()` on the
   upload step.
3. Generate a caption with a model provider and render the execution as Mermaid for a PR.
   Start with the Mermaid formatter not installed.
