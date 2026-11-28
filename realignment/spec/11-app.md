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
| Graph | React Flow canvas: steps, one control node per `if` / `loop` / `parallel` with ports; grey **rail** and coloured **tunnels** (SVG overlay); one **end marker** per side, path, or loop (`end:<structureId>:<side>`, no ports); data branches routed on lanes for `$ref` / `$state` only; `manifest.detached` nodes off the rail with a **disconnected** badge | `retrieve { type: "execution", id \| path }` |
| Node panel | Selected step: capability summary, bindings, schemas, transform code. Selected control node: one panel with Kind, Label, Inputs, and per-kind options; id read-only. End markers are not selectable and have no panel. Disabled during live run or replay | `retrieve { type: "capability", id }`, execution `retrieve` / `commit` |
| Add-node menu | **Core** group first (control node and `contract: "step"` + `code: "script"` capabilities), then plugin groups | `retrieve { type: "capability" }` |
| Edge panel | Selected branch: source node and port, target node and port, and a **Delete** button that removes the `$ref` (the input becomes unbound; validation reports it when required). Nothing else is editable here. Autosave via `commit { type: "execution", action: "update", id \| path, ifVersion, draft: true }` | execution `commit` |
| Validation | Issues list (code, message, path, suggestions); clicking an issue selects the node; nodes with errors get an error badge | `issues` from execution `retrieve` and draft `commit`; `execute { mode: "validate" }` |
| Run | Input form from `execution.accepts`; live step status; `if.select` dims the untaken side (rail band, nodes, and that side's end marker); loop overlays: `round N` on the control node (`loop.round`) and `rN` on the loop end marker; forEach: `loop.start` / `loop.item.*` / `loop.end`; result JSON; errors with issues | `execute { wait: false }` then `/v1/watch?runId=` |
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
- Layout: tree layout, left-to-right; painted **rail** SVG (`pointer-events: none`, `data-testid="ecp-rail-layer"`).
  **`ecp-tunnel`** nodes are invisible membership frames only; not `parentId`, not the painted tunnels. **Control nodes**
  (`ecp-if`, `ecp-parallel`, `ecp-loop` — one component with Kind). **End markers** (`ecp-end`, id
  `end:<structureId>:then|else|path-N|loop`, no ports) sit inside each tunnel edge; dragging one changes scope. Steps
  inside have typed ports. See `packages/app/REACTFLOW_RENDER.md` and `realignment/graph-model.md`.
- **Connectivity (graph).** C1: every `$ref` / `$state` in step or control `input` (including nested
  paths, merge-port lists, and `$script.params`) is drawn as a **data branch** from its producer
  (execution inputs, step `as`, loop `item` / `index`, enclosing `if` / `parallel` scoped `as` via
  `then` / `else` / `path N`). Branches after a loop carry arrays; the graph shows that on the reading
  port type (`T[]`). Literal-only inputs have no branch. No sequence-only connectors or orphans. A
  `detached` step has a badge and no required connector.
- Every canvas edit is a pure function `(manifest, action) → manifest` in `packages/app/src/graph/`.
- Tunnels are drawn only on the rail layer (grey rail; indigo striped loop with ↻ title; green `then`;
  red `else`; blue `path N`). Side labels sit outside the band; end marker labels inside the edge.
  Tunnels and end markers are never selected, configured, or connected to. The control node starts each
  side; an end marker closes that side.
- **Delete** (key and menu) by selection:

  | Selection | Result |
  | --- | --- |
  | Branch | Removes the `$ref` on the target input |
  | Step(s) | Removes them (the execution keeps at least one top-level step) |
  | Control node | Removes it and splices its nodes into the parent: `then` before `else`, paths in order, the loop body. The menu also offers **Delete with its nodes** |
  | End marker | Nothing; no menu; Delete does not remove it |
  | Inputs, Outputs, nothing | Nothing |

  **Delete** and **Backspace** apply the same rules to the canvas selection.
- Reconnect a
  detached **root step** by dragging a compatible data output onto its input: the binding is
  written and the step is placed after the source (Inputs → first top-level step; loop `item` →
  first body step). Detached `if`, loop, or parallel roots are not reattached this way (remove or
  recreate them).
- Right-click is always the App's, never the browser menu:
  - **Node** (step or control node only): Configure; **Wrap in** `if` / `parallel` / `loop`;
    Delete. Wrap `parallel` needs two or more siblings (one per path); with one selected node the
    reason is "Select two or more nodes, one per path".
  - **Control node** also: **Add node in then** / **else** (`if`), **Add node in path N** and **Add
    path** (`parallel`), **Add node in the loop** (`loop`); and **Delete with its nodes**. A new node
    goes first in that list.
  - **End marker:** right-click is suppressed; no App menu.
  - **Edge**: Configure, Delete branch.
  - **Empty canvas**: the capability menu. Inside a tunnel it inserts into that list at the position
    nearest the cursor (`then`, `else`, a path, the loop body); elsewhere at the top level.

  Menus pick an action; Configure opens the right-hand panel. No modal configure dialog.
- The capability menu is the same for canvas right-click and for dropping a connection on empty
  canvas: search, grouped by plugin, keyboard navigation, fed by `retrieve { type: "capability",
  query }`.
- While dragging from a port, incompatible ports are dimmed and refuse the drop. A successful drop
  writes `{ "$ref": "state.<as>[.<port>]" }` into the target node's `input` (or appends to a merge-port
  list when the sources are on opposite sides of the same `if`). Targets are steps and control nodes
  (`if`, `parallel`, loop driver `items` / `count`). By source: a step output writes
  `state.<as>[.field]`; Inputs `state.<key>`; loop `item` / `index` → `state.<as>` /
  `state.<as>Index`; an `if` `then` / `else` port or `parallel` path port → `state.<as>` (`as` is set
  from the control id when missing). A drop is refused when the types don't fit or the reader would
  run before the writer: `then` / `else` / path ports and loop `item` / `index` are readable only
  inside their tunnel. A drop on empty canvas opens the capability menu and
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
  delete the current canvas selection under the same focus rules. A drag that only stores a position
  override is not an undo step. Dragging an end marker or dragging a node into or out of a tunnel is one
  undo step. Both are disabled while the canvas is read-only.
- While a run is live or a replay is selected, the manifest cannot change: no editing menus, no
  connecting, editors read-only. Dragging nodes is still allowed.
- The App was ported from the pre-realignment tree into `packages/app` (`execution-to-reactflow.ts`,
  `extract-data-edges.ts`, `layout.ts`, `map-run-events.ts`, `ports-from-schema.ts`,
  `EcpStepNode`, `EcpDataEdge`, structure node components, `EcpIoNode`, `RunInputForm`, `RunOutputView`,
  styles). Manifest v2 (`uses`, markers, `if` / `parallel` / `loop`; end markers drawn, not stored); ports from JSON Schema (`accepts`/`returns`).
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
  statuses and result; runs list replays; unauthorised access. Menus (pane, edge, node, control node); rail layer and coloured tunnels; routed
  branches (`rail3-routing`); end-marker scope drag with one undo (`marker-scope`); connect including a
  refused incompatible drop and a branch to an `if` input; Delete of a branch or control node; wrap a
  step in an `if` and edit its expression; change loop Kind; add a node in `else` from the control-node
  menu; autosave with no Save button (`draft: true`); undo and redo where edits apply.
