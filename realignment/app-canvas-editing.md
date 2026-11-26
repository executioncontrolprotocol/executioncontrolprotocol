# App canvas editing: tunnels, connections, add capability, drag

**Status:** plan, 2026-11-24. Decisions below agreed with the maintainer; nothing built yet.
**Delivery:** one PR from `feature/app-canvas-editing` into `development`, one commit (or a few) per
phase. The branch stays open until every phase is done.
**Origin:** checking PR #105 (graph connectivity) turned up two route-edge bugs. Comparing with the
pre-realignment App (`legacy/packages/app`, deleted in `8fd1f4c7`; read it with
`git show 8fd1f4c7^:legacy/packages/app/<path>`) showed canvas editing that the realigned App doesn't
have yet. This plan brings those features back on the v2 manifest and the host API.

**Superseded in part:** [`graph-model.md`](graph-model.md) replaces the route-connector model this plan
was written for. D2, D3, D3a and [Deleting connections](#deleting-connections) (except `detached` and
draft rules) follow `graph-model.md` and `spec/11-app.md`: nodes and data branches, tunnels visual
only, one control node with Kind and drawn `end` terminals. The other decisions stand.

**Scope change:** spec 11 says the App is "view and run; expression editing on graph edges is in
scope", and `REALIGNMENT-PLAN.md` § Later lists "App editing: canvas edits written through `commit`
and patches". This plan moves the canvas edits below into scope. Spec 11 and the plan are updated in
phase 0, before any code.

## Decisions

| # | Decision |
| --- | --- |
| D1 | **Deleting a connection removes the connector, never a node.** The connector disappears entirely; it doesn't just lose its condition or expression. Nodes it connected stay on the canvas and in the file, now disconnected, and the execution is invalid until they're reconnected. See [Deleting connections](#deleting-connections). |
| D2 | **Superseded by `graph-model.md`.** Conditions live on `if` nodes (`expression` / `script` over `input`); data branches are `$ref` bindings only. |
| D3 | **Superseded by `graph-model.md` (tunnels are visual only; the control node starts each tunnel).** |
| D3a | **The App owns right-click.** Right-click never shows the browser menu anywhere on the canvas: on empty canvas it opens the capability menu, on a branch its menu, on a node the node menu. Wrap is only in the node menu. Tunnels are not right-click targets. |
| D4 | **The right-hand panel is where things are configured.** Menus only pick an action; Configure opens the panel. No modal configure dialogs (legacy had `RouteConfigureDialog` / `StepConfigureDialog`). |
| D5 | **One capability picker.** Right-clicking the canvas and dropping a connection on empty canvas open the same searchable capability menu at the cursor. |
| D6 | **Only valid connections can be made.** While dragging from a port, incompatible ports are dimmed and refuse the drop; the same check runs in `isValidConnection`. |
| D7 | **Nodes can be dragged.** Layout is automatic on open; any node can then be dragged into place. |
| D8 | **Edits save automatically, through `commit`.** No Save button. Every change is a `commit` as soon as it's made (text fields after a short pause). Where it lands is the host's storage decision: with `ecp app <path>` on a local host that's the file on disk. Undo / redo, in the canvas control bar next to zoom in / out / fit, cover mistakes. |
| D8a | **The App talks to the host only through the operations.** Executions, runs, capabilities and history are read with `retrieve`, written with `commit`, run with `execute`, followed with `/v1/watch`. No raw file routes, so the same App works against a host that isn't local. See [Host API only](#host-api-only). |
| D9 | **Edits are manifest edits.** Every action is a pure function `(manifest, action) → manifest` in `packages/app/src/graph/`, unit-tested without a browser. |
| D10 | **Editing never fights a run.** While a run is live or a replay is selected, parameters, config and structure can't change: no menus that edit the manifest, no connecting, editors read-only. Dragging nodes is still allowed. |
| D11 | **Positions live in the UI only.** Dragged positions are kept in the browser, not in the manifest, for now. |

## Deleting connections

Delete rules for branches and control nodes: [`graph-model.md`](graph-model.md) and
`spec/11-app.md`. Delete on a data branch removes the `$ref` binding; delete on a control node
follows the graph-model tables (`detached` steps when a node is left out of flow still apply below).

Delete on a data branch removes that binding. Nothing it connected is deleted; a node left without
its connection is **disconnected**: drawn where it was, saved in the file, and reported by
validation until it's reconnected.

| Connector | After Delete | Valid? |
| --- | --- | --- |
| Data branch (`$ref` in `input`) | The branch is gone and the target input is unbound. | Invalid if the input is required, until it's bound again |

**Reconnecting:** reconnect a disconnected **root step** by dragging a compatible output port onto
its input: the App binds the branch and places the step in document order. A disconnected `if`,
`loop`, or `parallel` root is not reattached this way.

**Where disconnected steps are saved:** the manifest has no free-floating steps today
(`additionalProperties: false`), and autosave means the browser and the file must never disagree.
So the protocol gets one optional field, which only makes the file *savable*. It is never runnable:

| Layer | Rule |
| --- | --- |
| Schema (L1) | Optional top-level `detached: Node[]`, `minItems: 1` (the App drops the key when the last one is reconnected). Same node shape as `steps`, so a detached step keeps its `id`, `as`, inputs and config and can be reconnected as-is. `steps` keeps `minItems: 1`. |
| Validation (L2) | One **error** per entry: `ECP_NODE_DETACHED` at `/detached/<i>`, "Step `<id>` isn't connected to the flow", suggestion "Reconnect it or delete it". Detached steps still get every other per-step check (unique ids across `steps` and `detached`, `uses` installed, input schema, config), so when one is reconnected nothing new surfaces. |
| Data flow (L3) | L3 does not run while `ECP_NODE_DETACHED` stands (L2 error). Detached steps produce nothing and their own reads aren't checked until they're placed. |
| `execute` | Unchanged rule: any error refuses the run. `mode: "validate"` lists the `ECP_NODE_DETACHED` issues. |
| Engine | Belt and braces: the run planner refuses a manifest with `detached` even if it's called without validation (`ECP_NODE_DETACHED`), so no code path can run it. |
| `retrieve` / CLI / MCP | The field shows up as-is, so an agent sees exactly what the App shows and can be asked to reconnect or delete. |

The App never offers Delete on the link from Inputs to the first step, so `steps` can't become empty.

**Saving invalid drafts:** `commit` refuses any manifest with an error today. It gains
`draft: true` (see [Host API only](#host-api-only)), which stores any manifest that loads and passes the base structure
schema, whatever its other errors (an unbound required input, a plugin that isn't installed here, L2 / L3),
and returns the issues. The App always commits with `draft: true`, so what you see is
always what's stored. Agents keep the strict default, and `execute` validates every run, so a
draft is never runnable.

**Control nodes:** Delete splices body nodes into the parent (`then` / `else` / paths / loop body) or
**Delete with its nodes** removes them too. Drawn `end` nodes have no Delete of their own.

**Steps:** the node menu has **Delete step**, which removes the step. That's the usual way a step is
removed.

## Host API only

Today the App reads and writes path-opened executions through raw file routes (`GET` / `PUT
/v1/file`, `GET /v1/files`), which only make sense when the host shares a disk with you. The App
moves to the operations, addressed the way `execute` already addresses an execution
(`{ id }` or `{ path }`):

| Today | After | Notes |
| --- | --- | --- |
| `GET /v1/file?path=` (open an execution) | `retrieve { type: "execution", path }` | `path` joins `id` as an address for `retrieve` and `commit`, as it already is for `execute`. A host whose storage has no paths returns `ECP_REQUEST_INVALID`; the App then works by id only. |
| `PUT /v1/file?path=` (save) | `commit { type: "execution", action: "update", path, object, ifVersion, draft: true }` | The host's storage writes it: the local host writes the file atomically, another host stores it wherever it keeps executions. |
| `GET /v1/files?dir=` (home list) | `retrieve { type: "execution", filter: { dir } }` for path-based hosts, `retrieve { type: "execution", query }` for stored executions | Same list shape for both. |
| `GET` / `PUT /v1/file` for `$script.path` files | `retrieve … include: ["scripts"]` returns `scripts: { "<relative path>": "<text>" }`; `commit … scripts: { … }` writes them with the manifest | Scripts travel with their execution; the host resolves relative paths. |
| `/v1/watch?path=` | `/v1/watch` with the same `{ id }` / `{ path }` address | Same mechanism. |
| Run artifacts `GET /v1/runs/:id/artifacts/:name` | unchanged | Already host-served content, not a file path. |

**Versions for paths.** `commit` needs `ifVersion` so the App and an agent editing the same
execution can't overwrite each other silently. For a path, `retrieve` returns a version derived
from the file's content, and `commit` with a stale one fails with the existing version-conflict
error. The App then reloads and replays the edit on top if it still applies, otherwise shows what
was discarded. Stored executions keep their numeric versions; for paths the version is an opaque
string, so `ifVersion` widens to `number | string`.

**`draft: true` on `commit`.** Stores any manifest that loads and passes the base structure schema, whatever its other errors,
and returns `{ version, issues }`. Without it, `commit` stays strict as today. `retrieve` of an
execution returns its current `issues`, so an agent opening a draft sees what's wrong.
`execute` is unchanged: it validates every run and refuses on any error, so drafts (including
anything with `detached`) can't run.

Once the App is moved over, `GET` / `PUT /v1/file` and `GET /v1/files` are removed from the host and
spec 09; nothing else uses them.

## Legacy reference

| Feature | Legacy files (under `legacy/packages/app/src/ui/`) | Port as |
| --- | --- | --- |
| Route ⋯ control and menu (Configure / Delete) | `components/EdgeMenuControlOverlay.tsx`, `lib/edge-menu.ts`, `ReactFlowCanvas.tsx` (`handleOpenEdgeMenu`, `handleEdgeContextMenu`) | Pill + ⋯ button inside `EcpRouteEdge` (clickable, `nodrag nopan`); shared `CanvasMenu` |
| Structure configure | legacy route dialogs | Right-hand panel on `if` / `loop` / `parallel` / `end` nodes |
| Wrap a step in `if` / parallel / loop; unwrap | legacy wrap helpers | `wrapSteps` / `unwrapStructure` in `graph/`, from node menus |
| Port type compatibility | `lib/step-connect.ts` (`portTypeKind`, `portsAreCompatible`) | Same rules over v2 JSON Schema ports |
| Dim incompatible ports while dragging | `EcpStepNode.tsx` / `EcpIoNode.tsx` (`useConnection`, `ecp-rf-port--incompatible`) | Same, in the current node components and the loop head |
| Connect / disconnect ports | `lib/graph-edit.ts` (`connectPorts`, `disconnectPorts`), `lib/step-connect.ts` (`buildStateRefFromConnection`) | `connectPorts` / `disconnectPorts` in `graph/` writing `{ "$ref": "state.<as>[.<port>]" }` |
| Drop on empty canvas → capability search | `lib/capability-discovery.ts`, `components/CapabilitySearchDialog.tsx`, `lib/capability-catalog.ts` | `CapabilityMenu` fed by `retrieve { type: "capability", query }` |
| Insert step and wire first compatible port | `lib/add-capability-step.ts` (`addCapabilityStep`, `firstMatchingPort`) | `addCapabilityStep` in `graph/`, v2 placement rules below |
| Right-click canvas → add capability | not in legacy | New: `onPaneContextMenu` opens `CapabilityMenu` |
| Node dragging | legacy had `nodesDraggable={false}` | New |

## Phases

Each phase ends with unit tests plus a Playwright spec in `packages/app/test/e2e/`, and leaves
`pnpm run check` green.

### Phase 0: spec and plan

- Update every spec this plan changes, as target behaviour: spec 02 (`detached`), spec 03
  (`ECP_NODE_DETACHED`, draft commit), spec 04 (the executor refuses `detached`), spec 06 (`path`,
  `draft`, `scripts`, `filter.dir`, `include: ["scripts"]`, string `ifVersion` for paths), spec 09
  (drop `/v1/file` and `/v1/files`; watch `{ id }` / `{ path }`), spec 10 (`--path`, `--draft`), spec
  11 (canvas editing and the host API), spec 12 (acceptance for the new behaviour).
- `REALIGNMENT-PLAN.md` § Later: saved node layout in the manifest, and collaborative editing.
- `packages/app/REACTFLOW_RENDER.md`: graph-model nodes and data branches per `graph-model.md`;
  detached nodes with a "disconnected" badge; dragged positions overriding layout.

### Phases 1–3 (canvas graph)

Canvas rendering, control nodes and drawn `end` terminals, tunnels, panels and
delete semantics: implemented per [`graph-model.md`](graph-model.md), `spec/11-app.md` and
`packages/app/REACTFLOW_RENDER.md` (graph-model PR #110). The route-connector plan in early drafts
of this file is retired.

### Phase 4: capability menu (right-click on canvas)

- `onPaneContextMenu` opens `CapabilityMenu` at the cursor: search box focused, results grouped
  by plugin, keyboard navigation (↑ ↓ Enter Esc), from `retrieve { type: "capability", query }`
  (debounced). Every capability the host reports is listed.
- Picking one calls `addCapabilityStep(manifest, { capability })`: a new step with a unique `id`
  and `as` from the capability label, appended to the top-level `steps`, or after the selected node
  in the same tunnel list. It's placed at the cursor (D7). Inputs start unbound; validation shows
  what's missing, and the new node is selected so its panel is open.

### Phase 5: drag to connect, incompatible ports, drop on empty canvas

- Turn on `nodesConnectable` in edit mode. Dragging from an output (or an Inputs port) to an input:
  - `isValidConnection` uses `portsAreCompatible` (legacy rules: same JSON-Schema kind, or either
    side `unknown`; a `file` output can't feed a `url!` input, per spec 11's `x-ecp-file` labels).
  - While dragging, incompatible ports on every node are dimmed and refuse the drop
    (`useConnection` in `EcpStepNode`, `EcpIoNode` and the loop head).
  - Dropping writes `{ "$ref": "state.<as>[.<port>]" }` into the target input, adding `as` to the
    source step if it has none.
  - A read must come after its writer, so connecting a later step's output to an earlier step's
    input is refused with a message; nothing is silently reordered.
- Dropping on empty canvas opens the same `CapabilityMenu` at the drop point with the origin port.
  The new step goes right after the origin (dragged from an output) or right before it (dragged
  from an input), is wired through the first compatible port (`firstMatchingPort`), and lands at
  the drop point. No compatible port still inserts the step, unwired.

### Phase 6: dragging nodes

- `nodesDraggable` on. Auto layout runs on open and whenever the structure changes (a step added,
  removed, wrapped or unwrapped); positions of nodes you dragged are kept across those relayouts.
- Frames follow their body: a frame is recomputed from its nodes' current positions on every drag.
  Dragging a node doesn't move it into or out of a structure (that's Wrap / Delete).
- Dragged positions are kept per execution (path or stored id) in the browser's local storage. An
  **Auto layout** control resets them.
- Tests: Playwright drags a node, reloads the page, and checks that the position and frame bounds
  held.

### Phase 7: host API only

- Protocol: `path` address on `retrieve` / `commit` (execution), opaque string versions for paths,
  `draft: true` on `commit`, `filter.dir` and `include: ["scripts"]` on `retrieve`, `scripts` on
  `commit`. Specs 06 (operations) and 09 (HTTP), types in `packages/protocol`, engine operations,
  local storage, MCP relay tool schemas, CLI (`ecp retrieve --path`, `ecp commit --path --draft`).
- App: `useExecutionDocument`, `HomeView`, `NodePanel` and `EdgePanel` move to `retrieve` / `commit`;
  `AppHostClient` loses `getFile`, `putFile` and `listFiles`.
- Host: remove `GET` / `PUT /v1/file` and `GET /v1/files`.
- Tests: conformance for each new operation shape (path round trip, stale version conflict,
  draft with errors stored and not runnable, strict commit unchanged); the existing App e2e
  (hot reload, script edit, save) passes on the new calls; a test asserts the App makes no
  request outside `/v1/retrieve`, `/v1/execute`, `/v1/commit`, `/v1/watch` and run artifacts.

### Phase 8: autosave, undo / redo (shipped)

- Single `useExecutionEditor` pipeline: edits apply to the latest **local** manifest; commits are
  serialized; own-version reloads do not reset selection, caret, or undo.
- No Save button. Structural edits commit immediately; text fields flush at 500 ms, on blur, and on
  unmount. `ECP_VERSION_CONFLICT` reloads and replays queued edits, naming any discarded. External
  reload clears undo and discards pending debounced text with a one-line note.
- Undo/redo in the canvas control bar; Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, and Ctrl/Cmd+Y. Status chip and
  `beforeunload` when saves are pending.

## Open questions

None open. Decisions recorded 2026-11-24.
