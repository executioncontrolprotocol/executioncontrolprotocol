# Phase 7 — App

**Goal:** `ecp app <path>` shows an execution file as a graph that hot-reloads on every save, with its validation issues, live run status and
run history, served by the host.

**Depends on:** Phase 4 (and Phase 5 for `ecp app`). **Spec:** 11, 09 (`/app`, `/v1/files`, `/v1/file`,
`/v1/watch`).

## Tasks

1. **Package setup:** Vite + React 19 + Tailwind + shadcn + Lucide + Monaco; `dist/web` built in `pnpm run build`; `host` serves it at `/app/` with correct content types and cache headers (hashed assets immutable, `index.html` no-cache).
2. **Port graph code** from `legacy/packages/app/src/graph` to v2 (02): node kinds, markers, `expr` labels, data edges from `$ref`/`$state`, ports from JSON Schema; dagre layout; route frames for loops.
3. **API client:** token from fragment → `sessionStorage` → bearer header; typed operations; SSE reader over `fetch` streaming (headers needed, so no `EventSource`); reconnect with backoff; 401 screen.
4. **Views** exactly as spec 11: home (executions, runs, open path), graph, node panel, validation, run (form from `accepts`, run, live statuses), runs history, JSON.
5. **Hot reload by path, always on:** `/v1/files` home list, `/v1/file`, `/v1/watch?path=` (execution file and its `$script.path` files), storage events for id-opened executions; keep viewport and selection; keep the last good graph when a save doesn't parse.
6. Move `legacy/packages/app/DESIGN.md` to `packages/app/DESIGN.md` and apply its tokens; update `packages/app/REACTFLOW_RENDER.md` (`.when()` → `expr`, v2 markers).

## Tests

- Unit (jsdom): manifest → graph for every fixture in `fixtures/manifests/valid`; run events → statuses incl. loop rounds and branch selection; form generation for every JSON Schema type in the fixtures.
- Playwright (A8): open by path and from the `dir` list; issues listed and clicking selects the node; edit file on disk → graph and issues update within 1 s; edit a `$script.path` file → re-validation; invalid JSON save → last good graph kept with the load error, recovers on the next save; run → statuses update live, result shown; runs list replays; no-token → 401 screen; open by id.

## Exit criteria

- [x] A8 passes on Ubuntu CI. Evidence: `pnpm run test:app` — 7/7 Playwright specs green locally (Chromium); CI runs the same `test:app` job on Ubuntu.
- [x] `REACTFLOW_RENDER.md` and `DESIGN.md` updated; no legacy imports. Evidence: `packages/app/DESIGN.md`, `packages/app/REACTFLOW_RENDER.md`; `rg legacy packages/app` empty.
- [x] Coverage floors met for the App's non-UI modules (graph, client, mapping). Evidence: `pnpm run test:coverage` — statements/lines/functions ≥90 %, branches ≥85 % with `packages/app/src/{graph,form,client}` included.
