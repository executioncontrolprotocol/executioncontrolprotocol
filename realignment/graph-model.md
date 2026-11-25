# Graph model: nodes and branches

**Status:** agreed 2026-11-25 (decisions below); being built on branch `feature/graph-model` (PR #110), one PR for
the whole change.
**Replaces:** the dotted route lines, pills and route menus of [`app-canvas-editing.md`](app-canvas-editing.md)
(decision D2 and the "Deleting connections" table) and the expressions that live on structures and step gates in
[spec 02](spec/02-execution-manifest.md). Everything else from that plan stays (detached steps, draft commits, the
host-API-only App, menus, the capability menu, dragging, autosave, undo / redo).

## Vocabulary

Only these words describe the graph:

| Word | Meaning |
| --- | --- |
| **Node** | Anything that runs or decides: a step (capability call or transform), an `if`, a `parallel`, a `loop`, and a loop's `end`. |
| **Port** | A named, typed input or output of a node. Types come from JSON Schema; a type that can't be known is `unknown`. |
| **Branch** | A connection from exactly one output port to exactly one input port. It carries a value and nothing else: no condition, no expression, no settings. In the manifest a branch is the `$ref` in the target node's `input`. |
| **Container** | The dotted boundary drawn around the nodes a pattern governs, from its start node to its end. Visual only: nothing is configured on it and nothing connects to it. Its scope comes from the manifest's nesting. |

Not used: edge, arm, route, pill, level, line.

## Principles

1. **Everything that computes is a node.** Conditions, loop drivers and transforms are nodes configured the same way:
   typed `accepts` (input ports), `input` bindings (branches into those ports), and an `expression` or `script`.
2. **Branches carry values only.** No expression or condition ever lives on a branch.
3. **Today's executor stays.** The manifest is a tree: nesting is scope, list order is run order. Moving to dataflow
   execution later is a separate decision this model doesn't block.
4. **Every port is typed.** From `accepts` / `returns` / capability schemas; `unknown` when it can't be known, which
   connects to anything (as ports do today).
5. **No backward branches.** Every branch goes from an earlier node to a later one, including inside loops.

## Nodes and their ports

### Step

Unchanged (capability call or transform). The step-level `expr` gate is removed: a step that runs conditionally sits
inside an `if`.

### `if`

```jsonc
{
  "type": "if",
  "id": "by-tier",
  "label": "Gold customer?",
  "accepts": { "type": "object", "properties": { "tier": { "type": "string" } }, "required": ["tier"] },
  "input": { "tier": { "$ref": "state.customer.tier" } },
  "expression": "input.tier === 'gold'",          // or "script": { "lang": "js", "source": "return input.tier === 'gold'" }
  "as": "customer",                                // optional: the input value, committed for nodes inside to bind
  "then": [ /* nodes, minItems 1 */ ],
  "else": [ /* nodes, optional */ ]
}
```

- **Input ports:** the `accepts` properties, bound with branches like a step's inputs.
- **Condition:** an `expression` or `script` evaluated with `input`, exactly as a transform is. `true` runs `then`.
  `false` runs `else`, **and so does any failure**: the condition throws, an input it needs is missing (e.g. an
  optional `$ref` that resolved to nothing), or it returns something other than a boolean. The run record notes
  which happened. Reshaping data before a condition is a transform node's job, not the condition's.
- **Output ports:** `then` and `else`. **Both carry the same value with the same contract**: the node's input,
  typed by `accepts`. When `as` is set it's committed to state, so a node inside either side binds it with
  `{ "$ref": "state.customer.tier" }`, and the canvas draws that as a branch from the `then` or `else` port
  (whichever side the node is on). Type checking works on both sides.
- **`else if`** is an `if` nested in `else`.

### `parallel`

```jsonc
{
  "type": "parallel",
  "id": "research",
  "accepts": { /* optional */ },
  "input": { /* optional */ },
  "as": "query",                 // optional, as for if
  "paths": [ [ /* nodes */ ], [ /* nodes */ ] ],   // minItems 2
  "maxConcurrency": 2
}
```

- **Output ports:** one per path (`path 1`, `path 2`, …), each passing the node's inputs through with the same
  contract (as `if`). A `parallel` with no `accepts` has no ports and just starts its paths.

### `loop` and its `end`

```jsonc
{
  "type": "loop",
  "id": "each-order",
  "mode": "forEach",                                   // "forEach" | "for" | "while"
  "input": { "items": { "$ref": "state.orders" } },    // forEach: items (array); for: count (integer); while: none
  "as": "order",                                       // name of the current item / index inside the loop
  "concurrency": 2,                                    // forEach
  "maxRounds": 5,                                      // while
  "steps": [ /* the loop body */ ],
  "end": {
    "accepts": { /* optional: typed inputs from the body */ },
    "input": {
      "value": { "$ref": "state.ship" },               // what this round / item contributes
      "repeat": { "$ref": "state.check.again" }        // while only: true = go again
    },
    "expression": "input.value",                       // optional: expression or script gathering the round's result
    "returns": { /* optional schema for each gathered result */ }
  },
  "into": "shipped"                                    // state key for the loop's result, outside the loop
}
```

- **Start node** (`loop`), on the container's left edge:
  - input ports: `items` (forEach) or `count` (for); none for `while`;
  - output ports into the container: `item` and `index` (forEach), `index` (for), typed from the `items` schema.
- **End node** (`end`), on the container's right edge. **One kind of end node closes every loop mode.**
  - input ports from inside: its `accepts` properties (or just `value` when there's no `accepts`), and, for `while`,
    `repeat` (`true` = go again);
  - optional `expression` / `script`, evaluated with `input` like a transform, gathers the round's / item's result;
    without one, the result is `input.value`;
  - output port outside: `results` — forEach: an array of the gathered results; for / while: the last one. Typed by
    `end.returns` when declared, else from the gathered value's type, else `unknown`.
- **`while` checks after each round**, by reading `repeat` from a node inside the body, so the body runs at least
  once and the check is a forward branch into the end node. A loop that may run zero times is wrapped in an `if`.
  `maxRounds` still caps it. A failing or non-boolean `repeat` ends the loop.
- Replaces today's loop `ref`, `expr`, string `collect`, and pre-round `while` check.

### Inputs and Outputs

Unchanged: execution `accepts` keys are output ports of the Inputs node; `returns` keys are input ports of the
Outputs node.

## Containers

- Drawn from the manifest tree; never configured, selected or connected to.
- The start node (`if`, `parallel`, `loop`) sits **on the container's left edge, centred on the dotted line**: its
  input ports are outside, its output ports inside. A loop's `end` node sits on the right edge the same way:
  inputs inside, `results` outside. An `if` / `parallel` container closes after the last node inside it.
- An `if` container is split into two bands, `then` (top) and `else` (bottom), level with those ports; a `parallel`
  into one band per path. A node's band is the list it's in, so a node with only literal inputs still visibly belongs
  to a side without needing a branch.
- Nested containers nest (the compound layout from the pattern-examples work stays).

## Branches on the canvas

- Drawn only between an output port and an input port. Drawing one writes the `$ref`; deleting it removes the `$ref`
  (the input becomes unbound, and validation reports it if required).
- Refused when the types don't fit or the reader would run before the writer (today's port and scope rules).
- A node with no branches is fine (literal inputs only). The "every node has a visible line" rule from #105 is
  dropped.
- Detached nodes (`detached`, `ECP_NODE_DETACHED`) stay as built: outside every container, with a badge.

## Configuration and actions

- The right-hand panel shows the selected **node**: a step's inputs and capability; an `if`'s `accepts`, inputs and
  condition; a `loop`'s mode, `items` / `count`, `as`, limits; an `end`'s inputs, gathering expression / script, `returns`.
- A selected **branch** shows its two ports and offers Delete. Nothing else.
- Delete (key or menu): a branch removes the `$ref`; a step removes the step; a start node removes the pattern and
  keeps its nodes (the menu also offers "with its nodes"); a loop's `end` can't be deleted on its own.
- Right-click on a node offers Wrap in `if` / `parallel` / `loop`, as today.

## Schema changes (summary)

| Today (v2) | New |
| --- | --- |
| `branch` with `branches: [{ label, expr, steps }]` | `if` with `accepts`, `input`, `expression` / `script`, `then`, `else` |
| `parallel.branches` | `parallel.paths` (+ optional `accepts` / `input` / `as`) |
| loop `ref`, `expr`, string `collect`, pre-round `while` | loop `input.items` / `input.count`; `end` node with inputs, optional `expression` / `script`, `repeat`, `returns`; `while` checks after each round |
| step `expr` gate | removed (use `if`) |
| expressions that read `state` | conditions read their typed `input` only |

The executor keeps its shape: an `if` runs one of two lists, a `parallel` its paths, a loop its body; conditions and
loop checks are evaluated by the same QuickJS / expression runtime transforms use. Validation gains: condition and
`end` shapes, port types on `if` / `parallel` / `loop` / `end`, and the existing scope rules for branches.

## Decisions (2026-11-25)

1. **Stay on manifest version 2** and revise it in place (it isn't widely used yet): no version bump, no migration
   command. Every example, fixture, skill reference and doc in the repo is converted in the same PR.
2. **Conditions support `expression` and `script`**, built into `if` (and `end`), evaluated like a transform. Data that
   needs reshaping first goes through a transform node.
3. **An `if` whose condition fails runs `else`**, including a missing optional input.
4. **`parallel` passes its inputs through** to every path's output port.
5. **One `end` node closes every loop**, gathering results with an optional expression or script.
