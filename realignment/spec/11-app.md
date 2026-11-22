# 11 — App (MVP)

A React app served by the host at `/app/`, talking only to the host HTTP API (09). View and run;
expression editing on graph edges is in scope. The node panel, JSON view and other views stay
read-only.

## Opening

- **Path is the default.** `ecp app [path]` opens `/app/#token=<token>&open=<absolute path>`; with no
  argument it opens `&dir=<cwd>`, which lists the `*.ecp.json` files under the CLI's working
  directory (depth 3, max 200) to pick from. `ecp app --id <id>` opens a saved execution.
- **Hot reload is always on** for path-opened executions: the App watches the execution file
  and every file its `$script.path` entries reference, and reloads, re-validates and re-lays-out
  on each change. There is no toggle. Saved executions (by id) reload on storage changes the
  same way. The App reads the token
  from the fragment, keeps it in `sessionStorage`, removes the fragment from the URL
  (`history.replaceState`), and sends `Authorization: Bearer` on every API call.
- The home view (no `open`) shows the `*.ecp.json` files for `dir` (if given), saved executions
  (`retrieve { type: "execution" }`), recent runs (`retrieve { type: "run" }`), and a field to
  open any file path.

## Views

| View | Content | Data |
| --- | --- | --- |
| Graph | React Flow canvas of the execution: step nodes (capability id, label, status), route edges for branch arms / loop / parallel lines (labelled with arm label or `expr` text, loop `maxRounds`), data edges from `$ref` / `$state` / `expr` reads | Manifest from `retrieve` (id) or `GET /v1/file` (path; see "Files") |
| Node panel | Selected node: capability summary and description, input bindings (literal / ref / expr / script), step `accepts`/`returns` when declared on the step else capability schemas (collapsible JSON), transform `script` or `expression` in a textarea when editable (inline `source` via execution commit; `path` via `GET`/`PUT /v1/file`), config id | `retrieve { type: "capability", id }`, commit / file routes |
| Edge panel | Selected data or route edge: source/target handles, `$ref` (optional / fallback) or step `expr` gate / route `expr` (textarea when editable); data bindings are `$ref` only. Syntax via `execute { mode: "validate", execution: <draft> }` (`ECP_EXPR_INVALID` at the edited pointer only); save via `PUT /v1/file` (path) or `commit { type: "execution", action: "update", ifVersion }` (id). Payloads: `retrieve { type: "run", include: ["steps", "state"] }` for the selected or live run (source from state along the read path, target from the step record's resolved `input`; not on `step.end` events) | Host execute / commit / file routes |
| Validation | Issues list (code, message, path, suggestions); clicking an issue selects the node; nodes with errors get an error badge | `execute { mode: "validate" }` |
| Run | Input form generated from `execution.accepts` (string, number, integer, boolean, enum, object/array as JSON textarea); Run button; live per-node status (running / completed / skipped / failed / cancelled), loop overlays (`while`/`for`: round on the loop node; `forEach`: `done / count` on the loop node, `item N` on body steps from `loop.item.*` events), selected branch arm highlighted; result JSON; error with issues | `execute { wait: false }` then `/v1/watch?runId=` |
| Runs | Run history for this execution; selecting a run replays its statuses on the graph and shows step inputs/outputs (redacted) | `retrieve { type: "run", filter: { executionId }, include: ["steps"] }` |
| JSON | Read-only Monaco view of the manifest | — |

## Files

Path-opened executions use three host routes (09):

- `GET /v1/files?dir=<absolute>` lists `*.ecp.json` files under `dir` (depth 3, max 200,
  skipping `node_modules` and dot-folders).
- `GET /v1/file?path=<absolute>` returns the text of a `.ecp.json` file, or of a file referenced
  by an open execution's `$script.path` (read-only, max 2 MB).
- `PUT /v1/file?path=<absolute>` writes an existing `.ecp.json` that the App has open on
  `GET /v1/watch?path=` (same auth; max 2 MB).
- `GET /v1/watch?path=<absolute>` streams a change event whenever that execution file **or any
  of its `$script.path` files** changes (`fs.watch`, 100 ms debounce, 2 s poll fallback). The set
  of watched script files is recomputed after each reload.
- `GET /v1/runs/:runId/artifacts/:name` streams a captured artifact (same Bearer auth as the API).
  Names must pass `assertSafeArtifactName`; unknown or invalid names return `ECP_NOT_FOUND`. The
  run output panel loads `image/*` captures inline when `sizeBytes` is at most 8 MiB; other types
  are download links.

## Behaviour

- Hot reload: on a file/storage change event, re-fetch, re-validate, re-layout within 500 ms
  (keep viewport and selection when node ids persist). A file that fails to parse keeps the last
  good graph on screen and shows the load error (`ECP_EXECUTION_LOAD`) until the next good save.
  Reloading never interrupts a run in progress; the run panel keeps showing it. A dirty edge-edit
  draft is discarded on external reload with a one-line note.
- Layout: dagre, left-to-right; parallel lines stacked with a non-parent `ecp-frame` overlay per
  line (structure label on the frame, not repeated on route edges); `loop` with `mode: "forEach"`
  uses a frame around the body with the loop node at its head (handles `ref`/`expr`, `collect`,
  `into`); `while` / `for` loops use a back-edge into the body; branch arms fan out. Never set
  `parentId`
  (`.cursor/rules/reactflow-render.mdc`).
- The App was ported from the pre-realignment tree into `packages/app` (`execution-to-reactflow.ts`,
  `extract-data-edges.ts`, `layout.ts`, `map-run-events.ts`, `ports-from-schema.ts`,
  `EcpStepNode`, `EcpDataEdge`, `EcpRouteEdge`, `EcpIoNode`, `RunInputForm`, `RunOutputView`,
  styles). Adapt to v2 (`expr`, markers, `uses`); ports come from JSON Schema (`accepts`/`returns`).
  Port type labels: `file` / `file!` for `x-ecp-file` without `access: "url"` (including legacy
  `x-ecp-file: true`); `url` / `url!` when `access` is `url`, so the graph shows a publish step
  is required before binding.
- UI: dark mode, Tailwind + shadcn, Lucide icons, Monaco, design tokens from
  `packages/app/DESIGN.md`. Not a chat client.

## Tests

- Unit (Vitest + jsdom): manifest → graph mapping for every node kind and marker; run-event →
  status mapping; input form generation from `accepts`.
- Playwright (against a real host started in a temp `ECP_HOME` with `plugin-test` linked):
  open by path (and from the `dir` file list); validation errors render and select nodes; fix the
  file on disk → App updates within 1 s; edit a `$script.path` file → App re-validates; save
  invalid JSON → last good graph stays with the load error shown, then recovers on the next
  save; run → statuses update live and the result shows; runs list replays a past run;
  unauthorised access (no token) shows a clear message.
