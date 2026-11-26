# 02 — Execution manifest (v2)

JSON is the only execution format in the MVP. Files use the extension `.ecp.json`.

## Document

```jsonc
{
  "$schema": "file:///C:/Users/me/.ecp/schema/execution.schema.json", // optional, editors only; ignored by the host
  "schema": "@executioncontrolprotocol.execution",    // required, constant
  "version": "2.0",                                   // required, constant
  "execution": {                                      // optional block
    "id": "localize-banner",                          // optional here; required to commit
    "label": "Localize campaign banner",              // optional
    "description": "…",                               // optional
    "accepts": { "type": "object", … },               // optional JSON Schema (object) for run input
    "returns": { "type": "object", … }                // optional JSON Schema (object) for the result
  },
  "steps": [ /* Node, minItems 1 */ ],                // required
  "detached": [ /* Node, optional, minItems 1 */ ]    // omit when empty; never run
}
```

- Unknown top-level or `execution` properties are errors (`ECP_MANIFEST_INVALID`).
- `detached`: optional top-level `Node[]`, `minItems: 1`. Omit the key when it would be empty.
  Same node shape as `steps`, so an entry keeps its `id`, `as`, inputs and config. Entries are
  not in the flow and never run (03, 04). Ids are unique across `steps` and `detached`.
- `execution.id`: `^[a-z0-9][a-z0-9-]{0,63}$`.
- `accepts` and `returns` must be JSON Schemas of `"type": "object"` with `properties`. Their
  property names become top-level state keys: run input seeds state; `returns` selects which
  state keys form the result.

## Nodes

A node's kind comes from `type`. **Absent `type` means `step`.** Every node has a unique `id`
across the whole document (all nesting levels): `^[A-Za-z][A-Za-z0-9_-]{0,63}$`.

### Step

```json
{ "id": "prompt", "uses": "@executioncontrolprotocol/core.transform",
  "accepts": { "type": "object", "properties": { "headline": { "type": "string" } }, "required": ["headline"] },
  "returns": { "type": "object", "properties": { "prompt": { "type": "string" } }, "required": ["prompt"] },
  "input": { "headline": { "$ref": "state.doc.echo.headline" } },
  "script": { "lang": "js", "source": "return { prompt: `Translate: ${input.headline}` }" },
  "as": "prompt" },
{ "id": "translate", "label": "Translate headline", "uses": "@executioncontrolprotocol/anthropic.generate",
  "config": "anthropic/default",
  "input": { "prompt": { "$ref": "state.prompt.prompt" } },
  "as": "translation", "mode": "replace" }
```

| Field | Required | Rule |
| --- | --- | --- |
| `type` | no | `"step"` if present |
| `id` | yes | Unique |
| `label` | no | Display only |
| `uses` | yes | Capability id `@scope/name.capability`, must be installed |
| `config` | no | Config object id (`<plugin-short>/<name>`); default: `<plugin-short>/default` if it exists |
| `input` | no | Object validated against step `accepts` when the capability `contract` is `"step"`, otherwise the capability's `accepts` (after value markers resolve) |
| `accepts` | when `contract` is `"step"` | Step input JSON Schema (object). Required with `returns` on step-contract capabilities |
| `returns` | when `contract` is `"step"` | Step output JSON Schema (object). `{}` means any JSON at run time |
| `script` | when capability `code` is `"script"` | Transform script object: `lang: "js"`, exactly one of `source` / `path`; no `params` (plain field, not a `$script` marker) |
| `expression` | when capability `code` is `"expression"` | Expression string (for example JSONata); host does not syntax-check it |
| `as` | no | State key for the output: `^[A-Za-z_][A-Za-z0-9_]*$`, must not be an execution input name |
| `mode` | no | `create` (default), `replace`, `merge`, `append`. Requires `as` |
| `persist` | no | When `false`, skip uniform capture of output `FileRef`s into the run artifact store. Default `true` |

The legacy `version` mode is removed (it behaved exactly like `replace`; the v1 converter maps
it to `replace`).

### `if`

```json
{ "type": "if", "id": "check-headline", "accepts": { … }, "input": { … },
  "expression": "input.headline.length > 0",
  "then": [ … ], "else": [ … ] }
```

- Optional `accepts` / `input` bind the condition's inputs (when absent, `input` is `{}`).
- Exactly one of `expression` or `script` drives the condition over frozen `input`.
- `true` runs `then`; `false`, a throw, a missing optional input, or a non-boolean result runs
  `else` when present; otherwise nothing runs and `if.select` records `side: null`.
- Optional `as` requires `input`. The resolved `input` object is scoped for nodes inside `then` /
  `else` only (see 04).
- `then` has at least one node; `else`, when present, has at least one node.

### Loop

One control node; required `mode` is `"for"` or `"forEach"`. The drawn `end` is not stored. Each
round / item runs on a state copy; when the loop finishes, every body `as` (except the loop's item /
index names) is published to the parent as an ordered array (`T[]`, `null` slots when a writer did
not run or `onError: "continue"`). `count: 0` still publishes `[]`. Nested loops publish `T[][]`.

```json
{ "type": "loop", "mode": "for", "id": "n", "input": { "count": { "$ref": "state.count" } }, "as": "i", "steps": [ … ] }
{ "type": "loop", "mode": "forEach", "id": "variants", "input": { "items": { "$ref": "state.rows" } }, "as": "row",
  "steps": [ … ], "concurrency": 2, "onError": "continue" }
```

| `mode` | Driver (`input`) | Body state | Required loop fields | Only in this mode |
| --- | --- | --- | --- | --- |
| `for` | `count` (integer), read once (`0..1000`) | Copy per round; `state.<as>` is the index; `create` allowed in the body | `mode`, `input.count`, `as` | `loop.round` |
| `forEach` | `items` (array), read once (`0..10000` at run time) | Deep copy per item; `state.<as>` and `state.<as>Index` | `mode`, `input.items`, `as` | `concurrency` (`1..32`, default `1`), `onError` (`"fail"` or `"continue"`), `loop.start` / `loop.item.*` / `loop.end` |

`while`, stored `end`, `into`, `maxRounds`, `loop.repeat`, and `loop.exhausted` are rejected. See
03 and 04.

The separate `type: "forEach"` node and loop `throttle` are removed. See `realignment/graph-model.md`.

### Parallel

```json
{ "type": "parallel", "id": "prepare", "accepts": { … }, "input": { … }, "as": "query",
  "maxConcurrency": 2, "paths": [ [ …nodes… ], [ …nodes… ] ] }
```

- `paths`: array of node lists (`minItems 2`, each list `minItems 1`). Each path runs in order;
  paths run concurrently.
- Optional `accepts` / `input` / `as` pass the same scoped input object to every path (see 04).
- `maxConcurrency`: optional integer `>= 1`; default = host setting (4).

## Markers and node fields

See `realignment/graph-model.md` for the full design.

| Rule | Meaning |
| --- | --- |
| **R1** | **`$` marks a substitution in a value position** (`input`, `$script.params`, config `values`): `$ref`, `$state`, `$script` (and `$secret` / `$env` in config only). **Node fields are plain** — no `$` — including `uses`, `as`, step `mode`, loop `mode`, `if` `expression` / `script`, and a transform step's `script` object. |
| **R2** | **Data reaches a node only through `$ref`, `$state`, or literals.** Computed outputs come from steps; values after a loop are arrays on body keys. `$script` in `input` is code passed as data, not a host transform. |

| Marker | Shape | Resolves to | Allowed in |
| --- | --- | --- | --- |
| Ref | `{ "$ref": "state.<path>" \| ["state.<a>", "state.<b>", …], "optional"?, "fallback"? }` | Value at path, or merge port (list of 2+ paths) | `input`, `$script.params` |
| State handle | `{ "$state": "<path>" }` | Staged-write handle | `input` |
| Script | `{ "$script": { "lang", "source"?\|"path"?, "params"?, "ecmaVersion"? } }` | Syntax-checked string for a capability | `input` (string positions), `$script.params` |
| Secret / env | `{ "$secret": "…" }` / `{ "$env": "…" }` | Config values only | Config objects, not executions |

**Plain node fields (not markers):** step `script` on `code: "script"` capabilities
`{ "lang": "js", "source"?: "…", "path"?: "…", "ecmaVersion"?: n }` with exactly one of
`source` / `path`; `if` `expression` / `script`; loop `mode`, `as`, `concurrency`, `onError`.

## Expressions (`if` / `end` `expression` fields)

- A string containing **one JavaScript expression** evaluated over frozen `input` (for example
  `input.tier === 'gold'`). Step `expression` on a `code: "expression"` capability (JSONata) is
  unrelated.
- Checked for syntax at validation time (acorn `parseExpressionAt`, `ecmaVersion: 2022`): must be
  a single expression spanning the whole string. Otherwise `ECP_EXPR_INVALID` with line and column.
- On `if`, the result MUST be a boolean for `then`; any failure (throw, missing input, non-boolean,
  `false`) takes `else` when present (see 04).
- On loop `end`, the result is the gathered value for that round / item.
- Alternatively, `script` on `if` / `end` is a transform-style body that `return`s a value (QuickJS
  with frozen `input` only).

### Step-level contracts (transforms)

Capabilities that declare `contract: "step"` in their manifest require both `accepts` and
`returns` on the step. Those schemas define the input ports, output ports, and run-time
validation. The sibling manifest field `code` selects how the host runs the step:

| `code` | Step fields | Behaviour |
| --- | --- | --- |
| `"script"` | `script` required, `expression` forbidden | QuickJS runs the script with a frozen `input` clone (see 04); the plugin handler is not called |
| `"expression"` | `expression` required, `script` forbidden | The host calls the plugin handler with resolved `input` and `ctx.expression` |

On non-step-contract capabilities, step-level `accepts`, `returns`, `script`, and `expression`
are `ECP_MANIFEST_INVALID`.

## Value marker details (`input`, recursive, and `$script.params` only)

Any JSON value is allowed in `input`. These objects are markers (an object with one of these
keys is always a marker; other keys besides the listed ones are errors):

| Marker | Shape | Resolves to |
| --- | --- | --- |
| Ref | `{ "$ref": "state.<path>", "optional"?: true, "fallback"?: <json> }` | The value at that state path. Missing + `optional` → `fallback` if given, otherwise the property is omitted |
| State handle | `{ "$state": "<path>" }` | A handle object passed to the capability for staged writes (`ctx.store`) |
| Script | `{ "$script": { "lang": "js", "source"?: "<code>", "path"?: "<file>", "params"?: { … }, "ecmaVersion"?: 2020 } }` | A string: `const params = <JSON>;\n` + the script text. Never executed by ECP |

Path syntax: `state` followed by one or more segments; a segment is a property name
(`[A-Za-z_$][A-Za-z0-9_$-]*`) or an array index (`[0-9]+`): `state.doc.layers.0.name`.
`$state` paths use the same segments without the `state.` prefix.

`$script` rules:

- Exactly one of `source` and `path`.
- `path` is resolved relative to the directory of the execution file (file-referenced
  executions) or of the stored execution (`commit`-saved executions). Inline executions sent
  over MCP/HTTP can only use absolute paths. The file MUST exist and be UTF-8.
- `params` values may be literals or `$ref` (resolved first, recursively). The
  serialised params object MUST be JSON (no `undefined`, functions, `NaN`).
- The script text is parsed (never run) with acorn as a `script` (`ecmaVersion` default 2020,
  `allowReturnOutsideFunction: false`); failure → `ECP_SCRIPT_INVALID` with line and column
  relative to the script text.
- `$script` is only valid where the capability's `accepts` expects a string at that position
  (validated by resolving the capability's raw accepts subschema at that path — must accept a
  string, or an open object property; see 03).
- The resolved string is validated against the `accepts` string schema (for example
  `maxLength`), so size limits apply to the final text.

## Secrets and host details

Executions MUST NOT contain `$secret`, `$env`, credentials or host configuration. A `$secret`
or `$env` object anywhere in an execution is `ECP_MANIFEST_INVALID` with a suggestion to move it
into a config object (05).

## Smallest valid execution

```json
{ "schema": "@executioncontrolprotocol.execution", "version": "2.0",
  "steps": [ { "id": "echo", "uses": "@executioncontrolprotocol/test.echo", "input": { "value": "hi" }, "as": "echo" } ] }
```

## Reference example

`fixtures/manifests/valid/localize-banner.ecp.json` (written in Phase 0) uses every feature:
accepts/returns, sequence, `$ref` with `optional`/`fallback` and merge lists, `if`, `parallel`, loop
(`for`, `forEach`), all commit modes, `$state`, transforms with plain
`script` by `path` and by `source`, `$script` in `input`, and `config` on steps.
