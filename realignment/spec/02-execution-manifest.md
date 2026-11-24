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
  "config": "anthropic/default", "expr": "(state) => state.locale !== 'en'",
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
| `expr` | no | Gate. JS function source `(state) => boolean`; `false` skips the step |
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

### Branch

```json
{ "type": "branch", "id": "check-headline", "branches": [
  { "label": "missing", "expr": "(state) => !state.doc.headline", "steps": [ … ] },
  { "label": "default", "steps": [ … ] } ] }
```

- `branches`: array of arms, `minItems 1`. Each arm: `label?`, `expr?`, `steps` (`minItems 1`).
- Arms are tried in order; the first whose `expr` returns `true` runs. **An arm without `expr`
  is the default arm and MUST be last.** At most one default arm. If no arm matches and there's
  no default, nothing runs.

### Loop

One node type, three modes. Omit `mode` for `while` (today's loop).

```json
{ "type": "loop", "id": "refine", "expr": "(state) => state.translation.score < 0.8", "maxRounds": 3, "steps": [ … ] }
{ "type": "loop", "mode": "for", "id": "n", "ref": "state.count", "as": "i", "steps": [ … ] }
{ "type": "loop", "mode": "forEach", "id": "variants", "ref": "state.rows", "as": "row",
  "steps": [ … ], "collect": "state.itemResult", "into": "results", "concurrency": 2, "onError": "continue" }
```

Every loop has exactly one of `ref` (a state path string, same syntax as `$ref`, for example
`"state.rows"`) or `expr` (a JS function string). Neither or both → `ECP_MANIFEST_INVALID`.
`expr` in control positions (gates) must return a boolean; in `for` / `forEach` mode the host
also evaluates `expr` as a loop source expression (integer or array). See 04.

| `mode` | Driver | Body state | Required fields | Only in this mode |
| --- | --- | --- | --- | --- |
| `while` (default) | `ref` (boolean) or `expr` (boolean), checked **before each round** (including the first); `true` runs a round | Shared with the run; `create` in the body → `ECP_COMMIT_CONFLICT` | `maxRounds` (`1..1000`) | `maxRounds`, `loop.exhausted` when the cap is reached |
| `for` | `ref` (integer) or `expr` (integer), read **once**; body runs that many times (`0..1000`) | Shared; `state.<as>` is the iteration index (from 0) during the loop and is removed when the loop ends; `create` in the body → `ECP_COMMIT_CONFLICT` | `as` | — |
| `forEach` | `ref` (array) or `expr` (array), read **once** (`0..10000` items at run time) | Each item on a deep copy of state at loop start plus `state.<as>` and `state.<as>Index`; body writes stay in the copy (`create` allowed) | `as`, `collect`, `into` | `concurrency` (`1..32`, default `1`), `onError` (`"fail"` default or `"continue"`) |

`forEach` `collect` is a state path (resolved in the item's scope after the body); when every
item has finished, `state.<into>` is the collected results in item order (`create` semantics).
With `onError: "continue"`, failed items record `null` and `{ index, error }` entries go to
`state.<into>Errors`.

The separate `type: "forEach"` node and loop `throttle` are removed. See `realignment/loops.md`.

### Parallel

```json
{ "type": "parallel", "id": "prepare", "maxConcurrency": 2, "branches": [ [ …nodes… ], [ …nodes… ] ] }
```

- `branches`: array of node lists (`minItems 2`, each list `minItems 1`). Each list runs in
  order; lists run concurrently.
- `maxConcurrency`: optional integer `>= 1`; default = host setting (4).

## Markers and node fields

See `realignment/loops.md` for the full design.

| Rule | Meaning |
| --- | --- |
| **R1** | **`$` marks a substitution in a value position** (`input`, `$script.params`, config `values`): `$ref`, `$state`, `$script` (and `$secret` / `$env` in config only). **Node fields are plain** — no `$` — including `uses`, `as`, `into`, step `mode`, loop `mode`, `expr`, loop `ref` / `collect`, and a transform step's `script` object. |
| **R2** | **Data reaches a step only through `$ref`, `$state`, or literals.** Computed outputs come from steps or a loop's `collect`. Loop `expr` / `ref` drives repetition and never writes state. `$script` in `input` is code passed as data, not a data transform. |

| Marker | Shape | Resolves to | Allowed in |
| --- | --- | --- | --- |
| Ref | `{ "$ref": "state.<path>", "optional"?, "fallback"? }` | Value at path | `input`, `$script.params` |
| State handle | `{ "$state": "<path>" }` | Staged-write handle | `input` |
| Script | `{ "$script": { "lang", "source"?\|"path"?, "params"?, "ecmaVersion"? } }` | Syntax-checked string for a capability | `input` (string positions), `$script.params` |
| Secret / env | `{ "$secret": "…" }` / `{ "$env": "…" }` | Config values only | Config objects, not executions |

**Plain node fields (not markers):** step `script` on `code: "script"` capabilities
`{ "lang": "js", "source"?: "…", "path"?: "…", "ecmaVersion"?: n }` with exactly one of
`source` / `path`; loop `ref`, `collect`; branch/loop/step `expr`; loop `mode`, `as`, `into`,
`maxRounds`, `concurrency`, `onError`.

## Expressions (`expr` fields)

- A string containing **one JavaScript function expression** (arrow or `function`) with at most
  one parameter (the state). Example: `"(state) => state.items.length > 0"`.
- Checked for syntax at validation time (acorn, `ecmaVersion: 2022`): must parse as a single
  `ArrowFunctionExpression` or `FunctionExpression`, `params.length <= 1`, no `async`, no
  generator. Otherwise `ECP_EXPR_INVALID` with line and column.
- In control positions (step `expr`, arm `expr`, `while` loop `expr` / `ref`) the result MUST be
  a boolean; any other value fails the run with `ECP_EXPR_RESULT_INVALID`.
- In `for` and `forEach` loop `expr` (and typed `ref`), the run-time value must be a
  non-negative integer or an array respectively (`ECP_TYPE_MISMATCH` / `ECP_LIMIT_EXCEEDED`; see 04).

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
accepts/returns, sequence, `$ref` with `optional`/`fallback`, gated step, branch with default
arm, parallel, loop (`while`, `for`, `forEach`), all commit modes, `$state`, transforms with
plain `script` by `path` and by `source`, `$script` in `input`,
and `config` on steps.
