# Phase 6 and 7 dogfood fixtures

Materials for Dogfood A ([`phase-6-docs-and-skill.md`](../phase-6-docs-and-skill.md) task 4)
and Dogfood B ([`phase-7-mcp.md`](../phase-7-mcp.md)).

These are **fixtures plus local proofs**, using the in-repo CLI / `ecp mcp serve` (not
`@next`, not Claude Desktop). They do **not** claim the 3×3 Claude Code or Claude Desktop
matrices.

| Task | Workflow | Injected failure | CLI proof | MCP proof |
| ---- | -------- | ---------------- | --------- | --------- |
| 1. JSONata reshape | `01-reshape.ecp.ts` | `01-reshape.fail.ecp.ts` (`ECP_STEP_FAILED`) | `phase-6-1.md` | `phase-7-1.md` |
| 2. Resize, upload, approve | `02-photo.ecp.ts` | `02-photo.fail.ecp.ts` (wrong `ref()`) | `phase-6-2.md` | `phase-7-2.md` |
| 3. Caption + Mermaid | `03-caption.ecp.ts` | format plugin not installed (`ECP_PLUGINS_MISSING`) | `phase-6-3.md` | `phase-7-3.md` |

MCP proofs are driven by `phase-7-mcp-client.mjs` (`ecp plugins link packages/mcp`, then
MCP SDK stdio).

## Prompts (for later Claude Code runs)

1. Reshape `{ items: [{ title }, ...] }` into `{ title, count }` with JSONata and save the
   result. Start from a wrong path.
2. Resize a product photo, upload it with approval, return a share link. Start from a wrong
   `ref()` on the upload step.
3. Generate a caption with Ollama (or Anthropic if a key is bound) and convert the workflow
   to Mermaid for a PR. Start with `format-mermaid` not installed.
