# Dogfood C — local App two-way sync

Local proof of §2.4 criterion 9 on 2026-10-24 (`milestone/cli-reset` after PR #49).
Hermetic fixture under `.ecp/app-*` so esbuild can resolve `@executioncontrolprotocol/core`.
`--no-open`; pairing token is never logged.

This is **not** a live Claude Code graph session. The 3×3 Claude Code matrix is operator
follow-up. JIT from npm cannot fully pass until `@next` is published; `ecp app --help` was
proven with `ecp plugins link plugins/plugin-app`.

## File → graph (within 1 s)

`pnpm exec vitest run --project unit plugins/plugin-app/test/server.test.ts`

10 passed, including **emits a file change event within 1s after a disk edit**.
The server watches the workflow directory (150 ms debounce), ignores self-writes by content
hash, and pushes `{ type: "file", source }` on `/api/events`. A disk edit of `value: "hi"` to
`from-disk` arrived on the WebSocket inside the 1 s bound.

## Graph → file

`pnpm exec vitest run --project app-live`

1 passed: **changes a step config in the graph and writes the file**.
Playwright opens `http://127.0.0.1:<port>/?token=…`, clicks the Echo step, sets the config
field to `from-graph`, saves. Core `applyPatch` + `renderWorkflowToFluent` rewrote the fixture;
`readFile` matched `/from-graph/` within 5 s (typically ~3 s including Chromium startup).

## Runs share the CLI journal

The same server file asserts **streams run events over the websocket**. `POST /api/run`
returns a `runId` and broadcasts `run.start` / `run.end` with that id. `ecp.run` is called with
`journal.workflowPath` and `environmentId` on the process host (`getHost()`), the same path as
`ecp run`.

## Honesty

- No hosted demo, chat, vault, Chrome AI, or in-page `HostAdapter`.
- Keep-list React carve from `pre-reset` (Monaco, shadcn dialogs) is still the AppShell +
  encoder, not a pixel copy of the old demo `App.tsx`.
- Claude Code editing a workflow while the graph is open was not run in this session.
