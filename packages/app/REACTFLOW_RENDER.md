# React Flow render

Encoder: `packages/app/src/graph/` (`executionToReactFlow`). `if`, `parallel`, and transform steps show each bound
input port plus one empty port (`__empty`); connecting there adds a multi-cardinal property. Merge ports use a `$ref`
list when validation allows opposite `if` sides. Viewer components:
`packages/app/src/web/components/` (`EcpStepNode`, `EcpIoNode`, `EcpIfNode`, `EcpParallelNode`,
`EcpLoopNode`, `EcpEndNode`, `EcpDataEdge`).

The encoder is pure: it takes a v2 execution manifest and optional capability schemas, and never calls the host.

## Connectivity

- **C1.** Every `$ref` / `$state` in a step or structure `input` (including nested paths and
  `$script.params`) is drawn as a **data branch** from its producer: execution inputs, a step `as`,
  a loop `item` / `index` port, the `then` / `else` / `path N` port of an enclosing `if` / `parallel`
  when reading `state.<as>`, or a loop `end` node `results` port for `state.<into>`. A node with only
  literal inputs has no branch.
- **No structural edge labels or sequence orphans.** Layout uses unlabelled `control` edges between
  sequential nodes; those are stripped before publish. Nothing invents fake `$ref`s for structure.
- **Published edges are `data` only** (plus transient `control` during layout).

## Nodes

- **Steps** (`ecp-step`): capability ports from schemas and manifest `input`.
- **Inputs / Outputs** (`ecp-io`): `execution.accepts` / `returns`.
- **`if`** (`ecp-if`): input ports from `accepts`; output ports `then` and `else`.
- **`parallel`** (`ecp-parallel`): optional shared inputs; output ports `path 1`, `path 2`, …
- **`loop`** (`ecp-loop`): `items` / `count` inputs; `item` / `index` outputs as mode requires.
- **`end`** (`ecp-end`, id `end:<structureId>`): small terminal pill (`end if`, `end loop`, …).
  Drawn only; no ports.
- **Tunnels** (`ecp-tunnel`): tinted rounded regions for `then` / `else` / `path` / loop body.
  Sized after tree layout from member nodes; `pointerEvents: none`.

## Run overlay

- `if.select` sets `choices[ifId]` to `then`, `else`, or `null`; the App can style skipped sides.
- Loop events `loop.round`, `loop.repeat`, `loop.exhausted`, and `loop.item.*` mark loop / `end` progress.
- Legacy step gates and old branch styling are removed; use `if.select` and loop events only.

## Editing

The model is nodes and branches; see `realignment/graph-model.md`.

- A **branch** is one output port to one input port, stored as a `$ref` in the target node's `input`
  (step, `if`, `parallel`, loop driver, `end`). Delete on a selected branch (key, menu or edge panel
  button) removes the `$ref`.
- Delete on an **`if` / `parallel` / `loop` start** removes it and splices its nodes into the parent
  (`then` before `else`, paths in order, loop body); "Delete with its nodes" removes them too.
  Delete on **`end`** does nothing and reports "Delete the loop instead".
- Dropping a branch on a side port, path port or `end` `results` sets `as` / `into` on the owning node
  when missing; the drop is refused when types don't fit or the reader would run before the writer.
- Wrap in **`if`**, **`parallel`** (two or more siblings, one per path), or **`loop`** (`while` shell
  with `maxRounds: 1`).
- Panels: `if` (condition as expression or script), `parallel` (read-only paths, Add path), `loop`
  (mode, driver, `as`, `into`, ...), `end` (accepts, input bindings, gather, returns). All edits are
  pure functions in `src/graph/panel-edit.ts` and `structure-edit.ts`.
