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
  "steps": [ /* Node, minItems 1 */ ]                 // required
}
```

- Unknown top-level or `execution` properties are errors (`ECP_MANIFEST_INVALID`).
- `execution.id`: `^[a-z0-9][a-z0-9-]{0,63}$`.
- `accepts` and `returns` must be JSON Schemas of `"type": "object"` with `properties`. Their
  property names become top-level state keys: run input seeds state; `returns` selects which
  state keys form the result.

## Nodes

A node's kind comes from `type`. **Absent `type` means `step`.** Every node has a unique `id`
across the whole document (all nesting levels): `^[A-Za-z][A-Za-z0-9_-]{0,63}$`.

### Step

```json
{ "id": "translate", "label": "Translate headline", "uses": "@executioncontrolprotocol/anthropic.generate",
  "config": "anthropic/default", "expr": "(state) => state.locale !== 'en'",
  "input": { "prompt": { "$expr": "(state) => `Translate: ${state.doc.headline}`" } },
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
| `input` | no | Object validated against the capability's `accepts` (after value markers resolve) |
| `as` | no | State key for the output: `^[A-Za-z_][A-Za-z0-9_]*$`, must not be an execution input name |
| `mode` | no | `create` (default), `replace`, `merge`, `append`. Requires `as` |

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

```json
{ "type": "loop", "id": "refine", "expr": "(state) => state.translation.score < 0.8", "maxRounds": 3, "steps": [ … ] }
```

- `expr` required. Evaluated **before each round**, including the first; `true` runs a round.
- `maxRounds` required, integer `1..1000`. Reaching it ends the loop normally (event
  `loop.exhausted`, run record warning); it is not a failure.

### Parallel

```json
{ "type": "parallel", "id": "prepare", "maxConcurrency": 2, "branches": [ [ …nodes… ], [ …nodes… ] ] }
```

- `branches`: array of node lists (`minItems 2`, each list `minItems 1`). Each list runs in
  order; lists run concurrently.
- `maxConcurrency`: optional integer `>= 1`; default = host setting (4).

## Expressions (`expr` fields)

- A string containing **one JavaScript function expression** (arrow or `function`) with at most
  one parameter (the state). Example: `"(state) => state.items.length > 0"`.
- Checked for syntax at validation time (acorn, `ecmaVersion: 2022`): must parse as a single
  `ArrowFunctionExpression` or `FunctionExpression`, `params.length <= 1`, no `async`, no
  generator. Otherwise `ECP_EXPR_INVALID` with line and column.
- In control positions (step `expr`, arm `expr`, loop `expr`) the result MUST be a boolean; any
  other value fails the run with `ECP_EXPR_RESULT_INVALID`.

## Value markers (inside `input`, recursively, and inside `$script.params`)

Any JSON value is allowed in `input`. These objects are markers (an object with one of these
keys is always a marker; other keys besides the listed ones are errors):

| Marker | Shape | Resolves to |
| --- | --- | --- |
| Ref | `{ "$ref": "state.<path>", "optional"?: true, "fallback"?: <json> }` | The value at that state path. Missing + `optional` → `fallback` if given, otherwise the property is omitted |
| State handle | `{ "$state": "<path>" }` | A handle object passed to the capability for staged writes (`ctx.store`) |
| Expression | `{ "$expr": "<function source>" }` | The JSON value returned by the function, evaluated in QuickJS with the state |
| Script | `{ "$script": { "lang": "js", "source"?: "<code>", "path"?: "<file>", "params"?: { … }, "ecmaVersion"?: 2020 } }` | A string: `const params = <JSON>;\n` + the script text. Never executed by ECP |

Path syntax: `state` followed by one or more segments; a segment is a property name
(`[A-Za-z_$][A-Za-z0-9_$-]*`) or an array index (`[0-9]+`): `state.doc.layers.0.name`.
`$state` paths use the same segments without the `state.` prefix.

`$script` rules:

- Exactly one of `source` and `path`.
- `path` is resolved relative to the directory of the execution file (file-referenced
  executions) or of the stored execution (`commit`-saved executions). Inline executions sent
  over MCP/HTTP can only use absolute paths. The file MUST exist and be UTF-8.
- `params` values may be literals, `$ref` or `$expr` (resolved first, recursively). The
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
arm, parallel, loop, all commit modes, `$state`, `$expr`, `$script` by `path` and by `source`,
and `config` on steps.
