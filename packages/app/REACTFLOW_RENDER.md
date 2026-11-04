# React Flow render

Encoder: `packages/app/src/graph/`. Viewer: `packages/app/src/ui/components/ReactFlowCanvas.tsx`.

## Rules

- **Published edges are `data` or `route`.** Data edges come from `$ref` / `$state` (including
  nested input paths) and from step `.when()` gates that reference accepts / state keys. Route
  edges publish parallel / branch / loop structure (`data.kind: "route"` with a `route` subtype).
  Layout may insert temporary unlabeled control edges; strip those before publishing. Never invent
  fake `$ref`s for structure.
- **No group containers.** Do not emit `ecp-group` / `parentId` nesting. Structure is visible via
  route connectors (dashed stroke, hover pills, mid-path `...` configure for branch/loop).
- **Ports.** Literals and refs bind to handles. Ensure an output handle for every edged source
  path and an input handle for every edged target path (including dotted nested paths and the
  synthetic `when` handle).
- **Fan-out.** Multiple `$ref`s from one output are fine. Do not invent multi-source fan-in on
  one input key.
