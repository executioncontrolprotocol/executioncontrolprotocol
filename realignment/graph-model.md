# Graph model: nodes, branches and tunnels

**Status:** agreed 2026-11-26 (decisions below), on branch `feature/graph-model-tunnels`. It revises the containers-and-bands
model that PR #110 implements; that state is tagged `draft/graph-model-containers` so we can return to it.
**Mockup:** [`mockups/tunnels-if-in-loop.png`](mockups/tunnels-if-in-loop.png) — an `if` / `else` inside a forEach.

## Vocabulary

| Word | Meaning |
| --- | --- |
| **Node** | Anything that runs or decides: a step (capability call or transform) or a control node (`if`, `loop`, `parallel`). |
| **Port** | A named, typed input or output of a node. Types come from JSON Schema; `unknown` when they can't be known. |
| **Branch** | A connection from one output port to one input port. It carries one value — a property, a sub-object or a whole node output — and nothing else. In the manifest it's a `$ref` in the target node's `input`. **The only kind of line.** |
| **Tunnel** | The tinted shape drawn around the nodes a control node governs, from the control node to its `end`. It shows what runs; it carries nothing and is never configured or connected to. |
| **End** | The closing terminal of a control node. It ends the control's effect and carries no data. Drawn, never stored. |

Not used: edge, arm, route, pill, level, line, band, container.

## Principles

1. **Every line is data.** A branch carries a value from one port to another. Nothing else is drawn as a line.
2. **Tunnels show control.** A node runs under a control because it sits inside its tunnel, not because something is
   connected to it, so a node with only literal inputs can still run on one side or once per item.
3. **No code sees ambient state.** A capability step, a transform script, an `if` condition: each sees only its
   `input` — the values its branches and literals bind. State is the engine's record (where `$ref`s resolve, what's
   stored and resumed), not a scope. If it isn't connected, it isn't visible.
4. **Schemas are built by connecting.** Control nodes and transforms have multi-cardinal inputs: every branch you
   connect adds a typed port, and the ports together are the node's `accepts`.
5. **Today's executor stays.** The manifest is a tree: nesting is the tunnel, list order is run order.

## Nodes

### Step

A capability step's ports come from the plugin's `accepts` / `returns` (fixed). A transform step's inputs are
multi-cardinal (its `accepts` is what you connect); its outputs are its `returns`.

### `if`

```jsonc
{
  "type": "if",
  "id": "express",
  "label": "Express?",
  "accepts": { "type": "object", "properties": { "order": { "type": "object" } }, "required": ["order"] },
  "input": { "order": { "$ref": "state.order" } },
  "expression": "input.order.speed === 'express'",   // or "script": { "lang": "js", "source": "return …" }
  "as": "express",                                   // set by the App when something inside reads a then / else port
  "then": [ /* nodes */ ],
  "else": [ /* nodes, optional */ ]
}
```

- **Inputs:** multi-cardinal; they define `accepts`.
- **Condition:** `expression` or `script` over `input`, returning a boolean. `true` runs `then`; `false`, a throw, a
  missing optional input or a non-boolean runs `else` (the run record says why).
- **Outputs:** `then` and `else`, each carrying the inputs with the same types. A node inside reads them with
  `{ "$ref": "state.express.order" }`; they exist only inside the tunnel.
- **Tunnels:** a green `then` tube and a red `else` tube (labelled, not colour-only), meeting at `end if`.

### `loop`

```jsonc
{
  "type": "loop",
  "id": "each-order",
  "mode": "forEach",                                // "forEach" | "for"
  "input": { "items": { "$ref": "state.orders" } },  // forEach: items (array); for: count (integer)
  "as": "order",                                    // the current item (forEach) or index (for) inside the loop
  "concurrency": 2,                                 // forEach
  "onError": "fail",                                // forEach
  "steps": [ /* nodes */ ]
}
```

- **Outputs inside:** `item` and `index` (forEach) or `index` (for).
- **Tunnel:** a light grey shape around the body, ending at `end loop`.
- **`while` is retired for now.** `for` runs exactly `count` times; there is no condition.

### `parallel`

```jsonc
{ "type": "parallel", "id": "research", "accepts": { }, "input": { }, "as": "query",
  "paths": [ [ /* nodes */ ], [ /* nodes */ ] ], "maxConcurrency": 2 }
```

- **Outputs:** one per path, each carrying the inputs (as for `if`). No inputs → no outputs; it just starts its paths.
- **Tunnels:** one tube per path, all in one tone, each with a small `path 1`, `path 2`, … label in the same style as
  the `then` / `else` labels, meeting at `end parallel`.

### `end`

- Every control node has exactly one `end`. It's created and deleted with its control node and can't be added,
  moved out or deleted on its own. It isn't stored in the manifest: it's where the control's list closes.
- It has no ports. Branches pass across it freely.

## Branches across a tunnel's end

The end carries no data; what crosses it is decided by the branch:

| Leaving | A branch from a node inside to a node after the `end` carries |
| --- | --- |
| `parallel` | the value, definitely present (every path ran) |
| `if` | the value, possibly missing (the other side may have run) — so the reader needs a **merge port** or `optional` + `fallback` |
| `loop` | **an array**: one entry per item / round, in order (`T` → `T[]`; `null` for an item that failed with `onError: "continue"`). Nested loops give `T[][]`. A `for` with `count: 0` gives `[]`, so the value is always present. |

**Merge port:** one input port may take one branch from each side of the same `if`. In the manifest `$ref` takes a
list, and the engine resolves it to **the one value whose side ran**, so the node receives a single value, never an
array:

```jsonc
"input": { "pick": { "$ref": ["state.pick_fast.pick", "state.pick_standard.pick"] } }
```

- "Whose side ran" means the writer committed a value, not that the value is non-null: a step that returns `null`
  on the side that ran still gives `null`.
- Validation proves the refs come from different sides of the same `if` (directly, or of nested `if`s inside it), so
  at most one is ever present. When every side contributes, the port is definite; otherwise it needs `optional` +
  `fallback`. The port's type is the union of the sources.
- Refs that could both be present (two paths of a `parallel`, or two nodes on the same side) are refused: there'd be
  no single right value.

## Multi-cardinal ports

- A control node or transform shows its connected input ports plus one empty port below them. Connecting a branch to
  the empty port adds a property to `accepts` (named after the source port, typed from it, renamable) and the `$ref`
  to `input`, and a new empty port appears.
- Deleting the branch removes the binding; removing the port removes the property.
- Capability steps don't have them: their `accepts` comes from the plugin.

## Configuration and actions

- Right-hand panel: the selected node (step; `if`: inputs, condition as expression or script; `loop`: mode, driver,
  limits; `parallel`: paths, limit). A selected branch shows its two ports and Delete.
- Delete: a branch removes its `$ref`; a step removes the step; a control node removes the control and its `end`,
  keeping its nodes (or "with its nodes"). An `end` has no Delete of its own.
- Wrap a selection in `if` / `loop` / `parallel` (parallel needs two or more nodes, one per path).
- Drawing a branch is refused when types don't fit or the reader runs before the writer; a node can't read the other
  side of an `if`, another path, or a loop's item from outside it.

## Changes from the `draft/graph-model-containers` state

| Containers and bands (PR #110 today) | Tunnels (this proposal) |
| --- | --- |
| Dotted container split into `then` / `else` / path bands | Green `then` / red `else` tubes, one-tone path tubes, a grey box for loops; each labelled |
| Start node on the container's left edge, `end` only for loops | Control node at the tunnel's start; an `end` for every control node, drawn not stored |
| Loop `end` object: `input.value`, `repeat`, gather `expression` / `script`, `returns`; loop `into` | Removed. A branch leaving a loop carries `T[]` |
| `while` with post-round `repeat` | Retired; `for` is count-only |
| Reading after an `if`: `optional` + `fallback` | Merge port (`$ref` list), or `optional` + `fallback` |
| `accepts` edited as JSON | Multi-cardinal ports build `accepts` (JSON still editable) |

Unchanged: `if` with `accepts` / `input` / `expression` | `script` / `then` / `else`; `parallel.paths`; scoped `as` for
control outputs; conditions over `input` only; `ECP_NODE_DETACHED`; the tree executor.

## Decisions (2026-11-26)

1. A `for` with `count: 0` gives `[]` to readers after the loop.
2. Merge ports use a `$ref` list; the engine picks the value whose side ran, so the node gets one value.
3. `parallel` path tubes share one tone and carry `path N` labels styled like `then` / `else`.
