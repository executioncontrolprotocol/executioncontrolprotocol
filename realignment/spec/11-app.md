# 11 — App (MVP)

A React app served by the host at `/app/`, talking only to the host HTTP API (09). View and run;
no editing in the MVP.

## Opening

- `ecp app [path | id]` opens `/app/#token=<token>&open=<path or id>`. The App reads the token
  from the fragment, keeps it in `sessionStorage`, removes the fragment from the URL
  (`history.replaceState`), and sends `Authorization: Bearer` on every API call.
- Without `open`, the App shows a list of saved executions (`retrieve { type: "execution" }`)
  and recent runs (`retrieve { type: "run" }`), and a field to open a file path.

## Views

| View | Content | Data |
| --- | --- | --- |
| Graph | React Flow canvas of the execution: step nodes (capability id, label, status), route edges for branch arms / loop / parallel lines (labelled with arm label or `expr` text, loop `maxRounds`), data edges from `$ref` / `$state` / `expr` reads | Manifest from `retrieve` (id) or `GET /v1/file` (path; see "Files") |
| Node panel | Selected node: capability summary and description, input bindings (literal / ref / expr / script, with the script text in a read-only Monaco), `accepts` and `returns` schemas (collapsible JSON), config id | `retrieve { type: "capability", id }` |
| Validation | Issues list (code, message, path, suggestions); clicking an issue selects the node; nodes with errors get an error badge | `execute { mode: "validate" }` |
| Run | Input form generated from `execution.accepts` (string, number, integer, boolean, enum, object/array as JSON textarea); Run button; live per-node status (running / completed / skipped / failed / cancelled), loop round counter, selected branch arm highlighted; result JSON; error with issues | `execute { wait: false }` then `/v1/watch?runId=` |
| Runs | Run history for this execution; selecting a run replays its statuses on the graph and shows step inputs/outputs (redacted) | `retrieve { type: "run", filter: { executionId }, include: ["steps"] }` |
| JSON | Read-only Monaco view of the manifest | — |

## Files

Path-referenced executions: the host adds `GET /v1/file?path=<absolute>` (token required;
only files ending in `.ecp.json` or referenced by that execution's `$script.path`; read-only;
max 2 MB) so the App can show and live-reload them. `/v1/watch?path=<absolute>` streams change
events for that file (`fs.watch`, 100 ms debounce). Both routes are in 09's route table.

## Behaviour

- Live reload: on a file/storage change event, re-fetch, re-validate, re-layout (keep viewport
  and selection when node ids persist).
- Layout: dagre, left-to-right; parallel lines stacked; branch arms fan out; loop bodies drawn
  inside a route frame (no `parentId` containers; `.cursor/rules/reactflow-render.mdc`).
- Reuse from `legacy/packages/app`: `graph/workflow-to-reactflow.ts`, `extract-data-edges.ts`,
  `layout.ts`, `map-run-events.ts`, `EcpStepNode`, `EcpDataEdge`, `EcpRouteEdge`, `EcpIoNode`,
  `RunInputForm`, `RunOutputView`, styles. Adapt to v2 (`expr`, markers, `uses`), and take ports
  from JSON Schema (`accepts`/`returns`) instead of zod.
- UI: dark mode, Tailwind + shadcn, Lucide icons, Monaco, design tokens from
  `legacy/packages/app/DESIGN.md` (moved to `packages/app/DESIGN.md`). Not a chat client.

## Tests

- Unit (Vitest + jsdom): manifest → graph mapping for every node kind and marker; run-event →
  status mapping; input form generation from `accepts`.
- Playwright (against a real host started in a temp `ECP_HOME` with `plugin-test` linked):
  open by path; validation errors render and select nodes; fix the file on disk → App updates
  within 1 s; run → statuses update live and the result shows; runs list replays a past run;
  unauthorised access (no token) shows a clear message.
