# React Flow render

Encoder: `packages/app/src/graph/`. Viewer: `packages/app/src/ui/components/ReactFlowCanvas.tsx`.

## Rules

- **Published edges are data only.** Edges come from `$ref` / `$state` (including nested input
  paths) and from step `.when()` gates that reference accepts / state keys. Layout may insert
  temporary control edges; strip them before publishing the document.
- **Visual-only groups.** `ecp-group` frames wrap parallel / branch / loop children via
  `parentId`. They clarify structure; they are not authored from the canvas in this pass.
- **Ports.** Literals and refs bind to handles. Ensure an output handle for every edged source
  path and an input handle for every edged target path (including dotted nested paths and the
  synthetic `when` handle).
- **Fan-out.** Multiple `$ref`s from one output are fine. Do not invent multi-source fan-in on
  one input key.
