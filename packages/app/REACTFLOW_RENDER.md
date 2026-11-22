# React Flow render

Encoder: `packages/app/src/graph/` (`executionToReactFlow`). Viewer components:
`packages/app/src/web/components/` (`EcpStepNode`, `EcpIoNode`, `EcpDataEdge`, `EcpRouteEdge`).
The encoder is pure: it takes a v2 execution manifest (`@executioncontrolprotocol.execution`,
`2.0`) and optional capability `accepts` / `returns` JSON Schemas, and never calls the host.

## Rules

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
- **Route edges** publish structure (`data.kind: "route"`, `route`: `branch` / `parallel` /
  `loop` / `forEach`). Branch arms carry the arm `label` and `expr` text (`exprBadge`), or
  `defaultArm` for the arm without `expr`. Loops carry their `expr` and `maxRounds`, plus a
  `loopBack` edge from the body's exits to its entries (excluded from dagre ranks). Parallel lines
  use dashed route edges without repeating the structure label (the label is drawn on the frame).
  `forEach` bodies use a route edge from the `ecp-foreach` node into the body entry (no loop-back).
- **Parallel and forEach frames.** After dagre, emit one `ecp-frame` overlay per parallel node or
  `forEach` body: a non-interactive box sized to the union of that structure's step nodes (with
  padding). The parallel or `forEach` label is drawn on the frame, not on the route edges. Frames
  are not dagre parents and never set `parentId`.
- **`forEach` structure node.** Emit one selectable `ecp-foreach` node at the head of the body
  frame with target handles `items` and `collect` and a source handle `into`. The `items` ref
  reads end at `items`; the body step that produces the `collect` ref feeds `collect`; reads of
  `state.<into>` after the node start at `into`. Body-only keys (`<as>`, `<as>Index`, body step
  `as` keys) do not source edges outside the frame.
- **No group containers.** Do not emit `ecp-group` / `parentId` nesting. Branch and loop
  structure stay on route edges; parallel structure uses frames plus route connectors.
- **Inputs and Outputs nodes.** `execution.accepts` is always projected as the `ecp:accepts`
  node (possibly empty); `execution.returns` becomes the `ecp:returns` node when it declares
  properties.
- **Ports.** Input ports come from the capability `accepts` properties, then from `input` keys.
  Each input records its binding: `literal`, `ref` (`$ref` / `$state`), `expr` (step gate only, with
  the source) or `script` (`$script`, with its `source` or `path`; the host never runs it).
  A literal object holding markers keeps its literal preview and gets a dotted port per marker.
  Output ports are the whole-document `output` handle plus the flattened `returns` properties.
  Ensure an output handle for every edged source path and an input handle for every edged
  target path, including dotted nested paths and the `expr` handle.
- **Fan-out.** Multiple reads of one output are fine. Do not invent multi-source fan-in on one
  input key.
- **Run status** is folded from run events (`reduceRunEvent` / `replayRunEvents`) or pushed onto
  the progress bus (`applyRunEvent`): `step.*` set step statuses (with the loop round),
  `branch.select` marks the taken arm, `loop.round` / `loop.exhausted` track rounds, and steps
  still running when the run ends become `cancelled`.
