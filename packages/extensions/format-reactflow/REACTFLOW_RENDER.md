# React Flow render decisions

Canonical rules for `@executioncontrolprotocol/format-reactflow` and any React Flow viewer (including the browser demo). Follow these whenever changing encode output or the Flow canvas UI.

## Role of the canvas

- The **canvas is the workflow**. Do not wrap steps in a workflow / parallel / branch / loop **group** node for the published graph.
- Flatten structural containers to **step (`ecp-step`) nodes** only. Mermaid may still use subgraphs; React Flow does not.
- Layout may use temporary sequential **control** edges for dagre ranking, then **strip them** from the published document.

## Nodes and ports

- One node per workflow step (capability invocation), plus **projected I/O nodes** (`type: "ecp-io"`):
  - **Inputs** (`id: ecp:accepts`, `data.kind: "accepts"`) is always present. Output ports come from `workflow.accepts.properties` (empty ports if omitted).
  - **Outputs** (`id: ecp:returns`, `data.kind: "returns"`) is emitted only when `returns` has properties. Input ports come from `workflow.returns.properties`.
- I/O nodes are encode projections of the workflow contract — not dummy capabilities in `steps[]`.
- Port list is vertical: **inputs first (left handles), then outputs (right handles)**.
- Step ports come from capability Zod introspection (top-level fields), plus any extra keys present on `step.input`.
- Each port may include a portable **`valueSchema`** JSON Schema hint (primitives + constraints). Never encode UI widget names.
- Show a handle for **every** schema port on the node:
  - **Unconnected** — hollow ring (border only).
  - **Connected** (data edge / `$ref`) — solid fill.
- Input handle accent: tertiary cyan (`--color-tertiary-fixed-dim`). Output accent may stay primary yellow for the handle chrome; **idle route stroke matches the cyan connection color**.

## Type hints (`valueSchema`) — encode stays UI-neutral

Ports project capability types as **JSON Schema fragments**, centered on primitives. Constraints ride on the primitive; viewers choose widgets.

| Capability / Zod | Encode `valueSchema` | Example viewer mapping (demo) |
| --- | --- | --- |
| `z.string()` | `{ "type": "string" }` | text / textarea |
| `z.enum(["a","b"])` | `{ "type": "string", "enum": ["a","b"] }` | **`<select>`** (or radios / chips — viewer’s call) |
| `z.number()` | `{ "type": "number" }` | number input |
| `z.boolean()` | `{ "type": "boolean" }` | checkbox |
| `z.object({…})` | `{ "type": "object", "properties": … }` | JSON textarea (for now) |

Canonical story: **enum → dropdown** happens only in the viewer. Encode never publishes `"widget": "dropdown"`. Another app may map the same schema differently.

Keep short **`typeLabel`** (EQL-ish) for display / fallback when `valueSchema` is absent.

## Bindings (literals vs refs)

- Annotate each input from `step.input`:
  - **literal** — truncated preview on the port (`= …`), full value for tooltip / configure editor.
  - **ref** — show `← asKey.field` (strip `state.`); this is the only source of **data** edges.
- Unbound schema optionals remain ports without a binding until the user adds them.
- Returns input ports with a matching step `.as` or `accepts` property use the same **ref** contract (`binding: "ref"`, `refPath` without `state.`).

## Edges (property mapping only)

- Publish **data edges only**: each `$ref` becomes one edge with `sourceHandle` / `targetHandle` set to the property names (e.g. `text` → `context`).
- `state.<acceptsKey>` refs source from `ecp:accepts` with `sourceHandle` equal to the property name.
- `returns` edges are not `$ref`s in steps. Draw from the step whose `.as` matches a `returns` property to `ecp:returns` (`targetHandle` = property name). When the property is an `accepts` key (no matching `.as`), draw `ecp:accepts` → `ecp:returns`.
- Returns ports with a matching source use the same display contract as step inputs: `binding: "ref"` and `refPath` without `state.` (the property name).
- Layout ranks Inputs left and Outputs right (temporary control edges, then stripped).
- Never show handle-less “source→target” control connectors in the UI. Viewers must filter to `kind === "data"` with both handles present.
- **Fan-out** is supported: one output property may feed many inputs via multiple `$ref`s (multiple edges from the same `sourceHandle`).
- **Fan-in to one field** is still a single value (one `$ref` or one literal per input key). Dropping a new source on an occupied handle **replaces** the previous connection (overwrite `step.input[param]` or remap the `returns` key to the new source `.as`). Do not reject occupied targets in `isValidConnection`.

## Configure dialog (viewer)

- Encode owns schema projection. The viewer owns Configure chrome (widgets, patch write-back).
- **Configure** opens a wide dialog for the step or projected I/O node.
- Edit literal params; **Remove** stays available after save (rebuild `step.input`, keep `$ref` keys).
- **Add parameter** lists unbound Zod inputs on steps; on Inputs/Outputs it patches `workflow.accepts` / `workflow.returns` (not `steps[id]`).
- Map **`valueSchema`** (fallback `typeLabel`) to editors (`string` / `number` / `boolean` / `enum` select / `json`).
- Edit the commit key **`as` (store key)**; on rename, rewrite downstream `state.<oldAs>…` refs to the new key.
- Persist via `ecp.patch` then `syncFromManifest` so Fluent, Mermaid, JSON, and React Flow stay aligned.

## Selecting and deleting routes (viewer)

- Data edges are selectable (wide hit area). Highlight the selected path.
- Selected routes show a mid-path ellipsis that opens the same **Delete connection** menu (right-click still works). Click-away or Escape closes it.
- **Backspace** / **Delete** and **Delete connection** remove the binding (step `$ref` or `returns` property). Never delete workflow step nodes from the canvas.

## Run progress visuals (viewer)

| State | Edges | Nodes |
| ----- | ----- | ----- |
| Clean / idle | Solid cyan (same as connection handles) | Default chrome |
| In flight (`pending`/`running` source during run) | Yellow/cyan **marching ants** | Soft pulse on **running** only; quiet border on pending |
| Source step `completed` | Solid green | Stronger green border/glow |
| Failed | — | Error border |

- Do **not** animate edges on initial load / idle.
- Open the **workflow state** overlay when the run **finishes** (not at click). Provide an **Inspect state** control beside zoom/fit so users can open it on demand.

## Encode package vs demo

| Concern | Owner |
| ------- | ----- |
| Flat nodes, port metadata (`typeLabel`, **`valueSchema`**), data edges, layout, progress bus | `@executioncontrolprotocol/format-reactflow` |
| Handle hollow/solid, edge colors/ants, configure dialog (schema → widget map), inspect control, patch write-back | browser-demo React Flow panel |

| Encode owns | Viewer owns |
| ----------- | ----------- |
| Ports, bindings, `$ref` edges, I/O projection from `accepts`/`returns`, primitive `valueSchema` (+ constraints), `typeLabel` | Widget choice (e.g. `string`+`enum` → select), Configure chrome, validation UX, patch write-back |

Keep this file updated when changing React Flow render behavior.
