# 11 — App (MVP)

A React app served by the host at `/app/`, talking only to the host HTTP API (09). The App
views, runs and edits executions on the canvas. The JSON view stays read-only.

## Opening

- **Path is the default.** `ecp app [path]` opens `/app/#token=<token>&open=<absolute path>`; with no
  argument it opens `&dir=<cwd>`, which lists the `*.ecp.json` files under the CLI's working
  directory (depth 3, max 200) to pick from. `ecp app --id <id>` opens a saved execution.
- **Hot reload is always on** for path-opened executions: the App subscribes to
  `GET /v1/watch` with the `{ path }` or `{ id }` it opened; the host reports changes to that
  execution and to every `$script.path` file; there is no toggle. Saved executions (by id)
  reload on storage changes the same way. The App reads the token
  from the fragment, keeps it in `sessionStorage`, removes the fragment from the URL
  (`history.replaceState`), and sends `Authorization: Bearer` on every API call.
- The home view (no `open`) lists executions via `retrieve { type: "execution", filter: { dir } }`
  when `dir` is given, saved executions (`retrieve { type: "execution" }`), recent runs
  (`retrieve { type: "run" }`), and a field to open any path via `retrieve { type: "execution",
  path }`.

## Views

| View | Content | Data |
| --- | --- | --- |
| Graph | React Flow canvas: steps, `if` / `parallel` / `loop` / `end` structure nodes with ports, data branches for `$ref` / `$state` bindings only; `ecp-frame` containers; no route pills; detached steps show a badge | `retrieve { type: "execution", id \| path }` |
| Node panel | Selected node: capability summary and description, input bindings (literal / ref / expr / script), step `accepts`/`returns` when declared on the step else capability schemas (collapsible JSON), transform `script` or `expression` in a textarea when editable (inline `source` in the manifest; `path` scripts via `include: ["scripts"]` on `retrieve` and `scripts` on `commit`), config id. Configure opens this panel; no configure dialog | `retrieve { type: "capability", id }`, execution `retrieve` / `commit` |
| Edge panel | Selected data branch: source and target ports, `$ref` (optional / fallback); Delete removes the binding. Syntax via `execute { mode: "validate", execution: <draft> }` (`ECP_EXPR_INVALID` at the edited pointer only). Autosave via `commit { type: "execution", action: "update", id \| path, ifVersion, draft: true }`. Run payloads: `retrieve { type: "run", include: ["steps", "state"] }` when a run is selected | `retrieve` / `execute` / `commit` |
| Validation | Issues list (code, message, path, suggestions); clicking an issue selects the node; nodes with errors get an error badge | `issues` from execution `retrieve` and draft `commit`; `execute { mode: "validate" }` |
| Run | Input form from `execution.accepts`; live step status; `if.select` highlights taken `then` / `else` side; loop overlays on loop and `end` (`loop.round`, `loop.repeat`, `loop.exhausted`, `forEach` progress); result JSON; errors with issues | `execute { wait: false }` then `/v1/watch?runId=` |
| Runs | Run history for this execution; selecting a run replays its statuses on the graph and shows step inputs/outputs (redacted) | `retrieve { type: "run", filter: { executionId }, include: ["steps"] }` |
| JSON | Read-only Monaco view of the manifest | — |

## Host API

The App calls only these host routes (09):

- `POST /v1/retrieve`, `POST /v1/execute`, `POST /v1/commit`.
- `GET /v1/watch` with the same `{ id }` or `{ path }` address as `retrieve`, plus the existing
  `types` and `runId` query parameters. For a path, the host streams a change event whenever the
  execution file **or any of its `$script.path` files** changes (`fs.watch`, 100 ms debounce, 2 s
  poll fallback); the set of watched script files is recomputed after each reload.
- `GET /v1/runs/:runId/artifacts/:name` (artifact names, not filesystem paths). Names must pass
  `assertSafeArtifactName`; unknown or invalid names return `ECP_NOT_FOUND`. The run output
  panel loads `image/*` captures inline when `sizeBytes` is at most 8 MiB; other types are
  download links.

There is no `GET` or `PUT /v1/file` and no `GET /v1/files`.

- Open an execution with `retrieve { type: "execution", path }` or `{ id }`.
- The home directory list is `retrieve { type: "execution", filter: { dir } }`. Stored
  executions are `retrieve { type: "execution" }` or `{ query }`.
- Save with `commit { type: "execution", action: "update", path | id, object, ifVersion, draft: true }`.
- Script files travel with the execution: `include: ["scripts"]` on `retrieve`, `scripts` on `commit`.

## Behaviour

- Hot reload: on a file/storage change event, re-fetch, re-validate, re-layout within 500 ms
  (keep viewport and selection when node ids persist). A file that fails to parse keeps the last
  good graph on screen and shows the load error (`ECP_EXECUTION_LOAD`) until the next good save.
  Reloading never interrupts a run in progress; the run panel keeps showing it. A text edit still
  inside the 500 ms autosave pause is discarded on external reload with a one-line note.
- Layout: dagre, left-to-right; an `ecp-frame` for every `if`, parallel and loop; never `parentId`.
  Structure **nodes** (`ecp-if`, `ecp-parallel`, `ecp-loop`, `ecp-end` with id `end:<loopId>`) sit
  inside frames with typed ports. See `packages/app/REACTFLOW_RENDER.md`.
- **Connectivity (graph).** C1: every `$ref` in step or structure `input` (including nested paths and
  `$script.params`) is drawn as a **data branch** from its producer (execution inputs, step `as`,
  loop `item` / `index`, enclosing `if` / `parallel` `as` via `then` / `else` / `path N`, loop
  `into` from `end` `results`). Literal-only inputs have no branch. No route edges or sequence
  orphans. A `detached` step has a badge and no required connector.
- Every canvas edit is a pure function `(manifest, action) → manifest` in `packages/app/src/graph/`.
- Containers: `if`, parallel, and loop each have a frame and a ⋯ menu. Delete on a structure header
  unwraps and splices `then` then `else`, or paths in order (**keep steps**), or removes the
  pattern (**with its steps**). The loop `end` node is not deletable alone.
- Deleting a selected **data branch** removes the `$ref` on the target input. **Delete** and
  **Backspace** apply to selected branches, steps, or structure headers (not the `end` node).
- Reconnect a
  detached **root step** by dragging a compatible data output onto its input: the binding is
  written and the step is placed after the source (Inputs → first top-level step; loop `item` →
  first body step; loop `into` → immediately after the loop). Detached branch, loop, or parallel
  roots are not reattached this way (remove or recreate them).
- Right-click is always the App's, never the browser menu. Empty canvas opens the capability menu.
  A frame opens the container menu. An edge opens the edge menu. A node opens the node menu:
  Configure, Wrap in branch / parallel / loop, Delete step. Wrap is only on the node menu. Menus
  pick an action; Configure opens the right-hand panel. No modal configure dialog.
- The capability menu is the same for canvas right-click and for dropping a connection on empty
  canvas: search, grouped by plugin, keyboard navigation, fed by `retrieve { type: "capability",
  query }`.
- While dragging from a port, incompatible ports are dimmed and refuse the drop. A successful drop
  writes `{ "$ref": "state.<as>[.<port>]" }`. A drop on empty canvas opens the capability menu and
  wires the first compatible port. If none is compatible, the step is still inserted, unwired.
- Nodes can be dragged. Layout runs on open; dragged positions override it and are kept in the
  browser only, not in the manifest. An **Auto layout** control clears them.
- Autosave: no Save button. Edits apply to the latest **local** manifest; each change is
  `commit { …, ifVersion, draft: true }` immediately, except text fields, which flush at 500 ms
  after the last keystroke, on blur, and on unmount. A stale `ifVersion` (`ECP_VERSION_CONFLICT`)
  reloads the execution, replays queued edits that still apply, and names any that were discarded.
  Pending text inside the autosave pause is discarded on external reload with a one-line note. A
  workspace header chip shows Saving…, Saved, or the save error; closing the tab prompts when a
  commit or debounced edit is still pending.
- Undo and redo sit in the canvas control bar next to zoom in, zoom out and fit, and on Ctrl/Cmd+Z,
  Shift+Ctrl/Cmd+Z, and Ctrl/Cmd+Y when focus is not in a text field; **Delete** and **Backspace**
  delete the current canvas selection under the same focus rules. Node drags are not undo steps.
  Both are disabled while the canvas is read-only.
- While a run is live or a replay is selected, the manifest cannot change: no editing menus, no
  connecting, editors read-only. Dragging nodes is still allowed.
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
  open by path and from the `dir` list; validation issues render and select nodes; an external file
  change updates the App within 1 s; editing a script commits `scripts` and re-validates; a file
  that fails to parse keeps the last good graph and `ECP_EXECUTION_LOAD`, then recovers; run
  statuses and result; runs list replays; unauthorised access. Menus (pane, frame, edge, node),
  connect including a refused incompatible drop, and autosave with no Save button (`draft: true`).
