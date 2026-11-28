# React Flow render

Encoder: `packages/app/src/graph/` (`executionToReactFlow`). `if`, `parallel`, and transform steps show each bound
input port plus one empty port (`__empty`); connecting there adds a multi-cardinal property. Merge ports use a `$ref`
list when validation allows opposite `if` sides. Viewer components:
`packages/app/src/web/components/` (`EcpStepNode`, `EcpIoNode`, `EcpControlNode`, `EcpEndNode`, `EcpDataEdge`).

The encoder is pure: it takes a v2 execution manifest and optional capability schemas, and never calls the host.

## Connectivity

- **C1.** Every `$ref` / `$state` in a step or control `input` (including nested paths and
  `$script.params`) is drawn as a **data branch** from its producer: execution inputs, a step `as`,
  a loop `item` / `index` port, the `then` / `else` / `path N` port of an enclosing `if` / `parallel`
  when reading `state.<as>`, or a merge port (`$ref` list) whose refs sit on opposite sides of the same
  `if`. A node with only literal inputs has no branch.
- **No structural edge labels or sequence orphans.** Layout uses unlabelled `control` edges between
  sequential nodes; those are stripped before publish. Nothing invents fake `$ref`s for structure.
- **Published edges are `data` only** (plus transient `control` during layout).

## Nodes

- **Steps** (`ecp-step`): capability ports from schemas and manifest `input`.
- **Inputs / Outputs** (`ecp-io`): `execution.accepts` / `returns`.
- **Control** (`ecp-if` / `ecp-parallel` / `ecp-loop`): one component; Kind sets manifest `type` / loop `mode`.
  `if` and `parallel` use multi-cardinal inputs; `loop` has `items` or `count`.
- **End markers** (`ecp-end`, id `end:<structureId>:then|else|path-N|loop`): labels `end then`, `end else`,
  `end path N`, `end loop`. Drawn only; `connectable: false`. Placed by `alignEndMarkersToBandEdges`
  (`END_MARKER_INSET`). No context menu; not selectable; Delete does not remove them.
- **Tunnels** (`ecp-tunnel`): transparent membership frames for drop targets and the detached badge. Not the
  painted tunnels; `pointerEvents: none`.

## Rail SVG layer

`RailVisualLayer` draws `computeRailVisualLayer` shapes with `pointer-events: none` (`data-testid="ecp-rail-layer"`).
Grey rail (`ecp-rail-root`; `ecp-rail-loop-<id>` for loop bodies off the main row). Side bands (`ecp-side-<id>-then|else|path-N`),
labels outside (`ecp-side-label-…`), grey joins (`ecp-join-…`), loop region with ↻ title (`ecp-loop-region-…`,
`ecp-loop-title-<id>`).

## Branch routing

`computeBranchRoutes` returns the **middle** of each data branch path. `EcpDataEdge` stitches source and target port
positions with `composeBranchPath` and `BRANCH_ENTRY_CURVE` into the target. Shared tunnel segments use
`BRANCH_LANE_SPACING` (two passes for symmetric offsets). When routing is skipped (for example an endpoint is
`detached`), the edge falls back to React Flow `getBezierPath`.

## Layout gaps

Tree layout (`tree-layout.ts`): `TREE_FORK_GAP` (control to side columns), `TREE_JOIN_GAP` (after end markers),
`TREE_GAP_X`, `TREE_GAP_Y`, `TREE_NEST_GAP` per nested control at a side boundary (`sideStackGap`). End marker box:
`TREE_END_WIDTH` × `TREE_END_HEIGHT`.

## Run overlay

- `if.select` sets `choices[ifId]` to `then`, `else`, or `null`; the App dims the untaken side, its rail band, nodes,
  and end marker.
- Loop events `loop.round` (for), `loop.start` / `loop.item.*` / `loop.end` (forEach) mark progress.
- `loop.repeat` and `loop.exhausted` are removed.

## Editing

The model is nodes and branches; see `realignment/graph-model.md`.

- A **branch** is one output port to one input port, stored as a `$ref` in the target node's `input`
  (step or control). Delete on a selected branch (key, menu or edge panel button) removes the `$ref`.
- Delete on a **control node** removes it and splices its nodes into the parent (`then` before `else`,
  paths in order, loop body); **Delete with its nodes** removes them too. End markers have no menu and
  are not deletable on their own.
- Dropping a branch on a `then` / `else` / `path N` port sets `as` on the owning control when missing;
  the drop is refused when types don't fit or the reader would run before the writer.
- Wrap in **`if`**, **`parallel`** (two or more siblings, one per path), or **`loop`** (default Kind
  `for` with `count: 1`).
- Panels: one control panel (Kind, Label, Inputs, per-kind options); steps and transforms use the
  step panel. All edits are pure functions in `src/graph/panel-edit.ts` and `structure-edit.ts`.
