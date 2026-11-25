# Graph model: nodes and branches

**Status:** draft for review, 2026-11-25. Branch `feature/graph-model`; changes stack here until the model is agreed
and built. Nothing in this doc is implemented yet.
**Replaces:** the dotted route lines, pills and route menus of [`app-canvas-editing.md`](app-canvas-editing.md)
(decision D2 and the "Deleting connections" table) and the expressions that live on structures and step gates in
[spec 02](spec/02-execution-manifest.md). Everything else from that plan stays (detached steps, draft commits, the
host-API-only App, menus, the capability menu, dragging, autosave, undo / redo).

## Vocabulary

Only these words describe the graph:

| Word | Meaning |
| --- | --- |
| **Node** | Anything that runs or decides: a step (capability call or transform), an `if`, a `parallel`, a `loop`, and a loop's `collect` end. |
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
- **Condition:** an `expression` or `script` evaluated with `input`, exactly as a transform is; it must return
  `true` / `false` (anything else fails the run with a new `ECP_CONDITION_INVALID`).
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

- **Output ports:** one per path (`path 1`, `path 2`, …), each carrying the node's input with the same contract
  (as `if`). A `parallel` with no `accepts` just starts its paths.

### `loop` and its `collect` end

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
  "collect": {
    "input": {
      "value": { "$ref": "state.ship" },               // collected each round / item
      "repeat": { "$ref": "state.check.again" }        // while only: a boolean computed in the body
    },
    "returns": { /* optional schema for the loop's result */ }
  },
  "into": "shipped"                                    // state key for the result, outside the loop
}
```

- **Start node** (`loop`), on the container's left edge:
  - input ports: `items` (forEach) or `count` (for); none for `while`;
  - output ports into the container: `item` and `index` (forEach), `index` (for), typed from the `items` schema.
- **End node** (`collect`), on the container's right edge:
  - input ports from inside: `value` (what each round / item contributes) and, for `while`, `repeat` (`true` = go
    again);
  - output port outside: `results` — forEach: an array of `value`; for / while: the last `value`. Typed by
    `collect.returns` when declared, else from the `value` port's type, else `unknown`.
- **`while` checks after each round**, by reading `repeat` from a node inside the body, so the body runs at least
  once and the check is a forward branch into the end node. A loop that may run zero times is wrapped in an `if`.
  `maxRounds` still caps it.
- Replaces today's loop `ref`, `expr`, string `collect`, and pre-round `while` check.

### Inputs and Outputs

Unchanged: execution `accepts` keys are output ports of the Inputs node; `returns` keys are input ports of the
Outputs node.

## Containers

- Drawn from the manifest tree; never configured, selected or connected to.
- The start node (`if`, `parallel`, `loop`) sits **on the container's left edge, centred on the dotted line**: its
  input ports are outside, its output ports inside. A loop's `collect` end node sits on the right edge the same way:
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
  condition; a `loop`'s mode, `items` / `count`, `as`, limits; a `collect`'s `value`, `repeat`, `returns`.
- A selected **branch** shows its two ports and offers Delete. Nothing else.
- Delete (key or menu): a branch removes the `$ref`; a step removes the step; a start node removes the pattern and
  keeps its nodes (the menu also offers "with its nodes"); a `collect` end can't be deleted on its own.
- Right-click on a node offers Wrap in `if` / `parallel` / `loop`, as today.

## Schema changes (summary)

| Today (v2) | New |
| --- | --- |
| `branch` with `branches: [{ label, expr, steps }]` | `if` with `accepts`, `input`, `expression` / `script`, `then`, `else` |
| `parallel.branches` | `parallel.paths` (+ optional `accepts` / `input` / `as`) |
| loop `ref`, `expr`, string `collect`, pre-round `while` | loop `input.items` / `input.count`; `collect` end with `value`, `repeat`, `returns`; `while` checks after each round |
| step `expr` gate | removed (use `if`) |
| expressions that read `state` | conditions read their typed `input` only |

The executor keeps its shape: an `if` runs one of two lists, a `parallel` its paths, a loop its body; conditions and
loop checks are evaluated by the same QuickJS / expression runtime transforms use. Validation gains: condition and
`collect` shapes, port types on `if` / `parallel` / `loop` / `collect`, and the existing scope rules for branches.

## Open questions

1. **Version and migration.** This is a breaking manifest change. Bump to `"version": "3.0"` and ship an
   `ecp migrate` that converts v2 files (most conversions are mechanical: an `expr` like
   `(state) => state.tier === 'gold'` becomes `accepts` + `input` from the keys it reads and
   `input.tier === 'gold'`)? Or keep reading v2 alongside v3 for a while?
2. **Condition runtime.** Built-in `expression` / `script` fields on `if` / `collect` (as above), or `if` delegates
   to a transform capability (`uses: core.transform`)? Built-in keeps the manifest shorter.
3. **After an `if`.** A node after the `if` that reads something produced on only one side gets today's
   "maybe missing" rule (optional with a fallback). Is that enough, or do we want an optional `end if` node that
   merges both sides into one typed output?
4. **`parallel` inputs.** Is pass-through on `parallel` useful, or should it have no ports at all?
