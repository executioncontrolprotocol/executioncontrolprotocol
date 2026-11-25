# React Flow render

Encoder: `packages/app/src/graph/` (`executionToReactFlow`). Viewer components:
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
- **`end`** (`ecp-end`, id `end:<loopId>`): body inputs including `value` and `repeat` (`while`);
  output `results`.
- **Frames** (`ecp-frame`): visual containers for `if`, `parallel`, and `loop` (not dagre parents).

## Run overlay

- `if.select` sets `choices[ifId]` to `then`, `else`, or `null`; the App can style skipped sides.
- Loop events `loop.round`, `loop.repeat`, `loop.exhausted`, and `loop.item.*` mark loop / `end` progress.
- Legacy step gates and old branch styling are removed; use `if.select` and loop events only.

## Editing

- Delete on a selected **branch** removes the `$ref` on the target input.
- Delete on an **`if` / `parallel` / `loop` start** unwraps and splices body nodes; **`end` is not deletable**.
- Wrap in **`if`**, **`parallel`** (multi-select), or **`loop`** (`while` shell with `maxRounds: 1`).
