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
- **`end`** (`ecp-end`, id `end:<controlId>`): small terminal label (`end if`, `end loop`, …). Drawn only; no ports.
- **Tunnels** (`ecp-tunnel`): tinted rounded regions for `then` / `else` / path / loop body.
  Sized after tree layout from member nodes; `pointerEvents: none`.

## Run overlay

- `if.select` sets `choices[ifId]` to `then`, `else`, or `null`; the App can style skipped sides.
- Loop events `loop.round` (for), `loop.start` / `loop.item.*` / `loop.end` (forEach) mark progress.
- `loop.repeat` and `loop.exhausted` are removed.

## Editing

The model is nodes and branches; see `realignment/graph-model.md`.

- A **branch** is one output port to one input port, stored as a `$ref` in the target node's `input`
  (step or control). Delete on a selected branch (key, menu or edge panel button) removes the `$ref`.
- Delete on a **control node** removes it and splices its nodes into the parent (`then` before `else`,
  paths in order, loop body); **Delete with its nodes** removes them too. Delete on **`end`** does
  nothing and reports "Delete the control node instead".
- Dropping a branch on a `then` / `else` / `path N` port sets `as` on the owning control when missing;
  the drop is refused when types don't fit or the reader would run before the writer.
- Wrap in **`if`**, **`parallel`** (two or more siblings, one per path), or **`loop`** (default Kind
  `for` with `count: 1`).
- Panels: one control panel (Kind, Label, Inputs, per-kind options); steps and transforms use the
  step panel. All edits are pure functions in `src/graph/panel-edit.ts` and `structure-edit.ts`.
