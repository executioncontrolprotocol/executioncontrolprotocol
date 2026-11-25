# React Flow render

Encoder: `packages/app/src/graph/` (`executionToReactFlow`). Viewer components:
`packages/app/src/web/components/` (`EcpStepNode`, `EcpIoNode`, `EcpDataEdge`, `EcpRouteEdge`).
The encoder is pure: it takes a v2 execution manifest (`@executioncontrolprotocol.execution`,
`2.0`) and optional capability `accepts` / `returns` JSON Schemas, and never calls the host.

## Rules

### Connectivity

- **C1. Every state-bound input has a visible edge from where its value comes from.** That covers step
  `input` `$ref` / `$state` reads (including nested paths and `$script.params`), step `expr` gate reads, a
  loop's `ref`, the state a loop's `expr` reads (best effort), a `forEach` loop's `collect`, reads of a
  `forEach` loop's `into`, reads of execution inputs (from the Inputs node), and reads of a loop's item
  (`state.<as>` and `state.<as>Index` in `forEach`).
- **C2. No orphaned nodes.** Every rendered node (steps, loop head nodes, the Inputs and Outputs nodes) has
  at least one visible edge. Frames are not nodes for this purpose. Otherwise-orphaned nodes keep their
  layout control edges as visible `sequence` route edges (no label).

- **Published edges are `data` or `route`.** Layout may insert temporary unlabelled `control`
  edges between sequential steps; strip those before publishing. Never invent fake `$ref`s for
  structure.
- **Data edges** come from what a step reads:
  - `$ref` and `$state` paths in `input`, including nested input paths and `$script.params`.
  - Step `expr` gate reads (same state-path rules as below) into the synthetic `expr` input
    port on a gated step.
  - The state paths a step `expr` gate reads, into the synthetic `expr` input handle.
  - `execution.returns` keys, from the step that writes the key (or the Inputs node).
  A read resolves to the last earlier step whose `as` is the key, else the Inputs node when
  `execution.accepts` declares the key, else another step writing it (a loop-carried value).
  A step never gets an edge from itself.
  - Every loop mode gets a head `ecp-loop` node with `ref` / `expr` / `collect` (`forEach`) inputs and
    `item` (`for` / `forEach`) and `into` (`forEach`) outputs. A `ref` driver and loop `expr` reads connect
    like step gates. Reads of `state.<as>` inside the loop resolve to the head's `item` handle (innermost
    binder wins). Reads of `state.<into>` after a `forEach` resolve to `into`.
- **Route edges** publish structure (`data.kind: "route"`, `route`: `branch` / `parallel` /
  `loop` / `sequence`). Branch arms carry the arm `label` and `expr` text (`exprBadge`), or
  `defaultArm` for the arm without `expr`. Every loop head connects into its body; `while` / `for`
  loops carry their driver (`ref` or `expr` label), `maxRounds` when present, and a `loopBack` edge from
  the body's exits to the head (excluded from dagre ranks). `forEach` mode uses a route edge from the
  loop head into the body entry (no loop-back). `sequence` routes preserve connectivity for literal-only
  steps. Parallel lines use dashed route edges without repeating the structure label (the label is drawn
  on the frame).
- **Parallel and forEach frames.** After dagre, emit one `ecp-frame` overlay per parallel node or
  `forEach` loop body: a non-interactive box sized to the union of that structure's step nodes (with
  padding). The structure label is drawn on the frame, not on the route edges. Frames are not dagre
  parents and never set `parentId`.
- **Loop head node.** Every `loop` (all modes) is an `ecp-loop` node at the head of the body (or frame for
  `forEach`), with target handles for `ref` / `expr` / `collect` and source handles `item` and `into` as
  applicable.
- **No group containers.** Do not emit `ecp-group` / `parentId` nesting. Branch and loop
  structure stay on route edges; parallel structure uses frames plus route connectors.
- **Inputs and Outputs nodes.** `execution.accepts` is always projected as the `ecp:accepts`
  node (possibly empty); `execution.returns` becomes the `ecp:returns` node when it declares
  properties.
- **Ports.** Input ports come from the capability `accepts` properties, then from `input` keys.
  Each input records its binding: `literal`, `ref` (`$ref` / `$state`), `expr` (step gate only, with
  the source), transform `script` (plain object with `source` or `path`), or `script` marker (`$script`
  in `input`, with its `source` or `path`).
  A literal object holding markers keeps its literal preview and gets a dotted port per marker.
  Output ports are the whole-document `output` handle plus the flattened `returns` properties.
  Ensure an output handle for every edged source path and an input handle for every edged
  target path, including dotted nested paths and the `expr` handle.
- **Fan-out.** Multiple reads of one output are fine. Do not invent multi-source fan-in on one
  input key.
- **Run status** is folded from run events (`reduceRunEvent` / `replayRunEvents`) or pushed onto
  the progress bus (`applyRunEvent`): `step.*` set step statuses (with the loop round or item),
  `branch.select` marks the taken arm, `loop.round` / `loop.exhausted` track `while` rounds,
  `loop.start` / `loop.item.*` / `loop.end` track `forEach` progress, and steps still running
  when the run ends become `cancelled`.
