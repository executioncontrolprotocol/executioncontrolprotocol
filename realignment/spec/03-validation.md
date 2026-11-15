# 03 — Validation

The host is the only authority on whether an execution is valid. Every surface (MCP, CLI, HTTP,
App) gets the same `ValidationResult`, so an agent can fix and resubmit in a loop.

## Layers (run in this order; later layers run only if earlier ones have no errors)

| Layer | Checks | Codes |
| --- | --- | --- |
| L0 Load | JSON parse, file exists, `schema`/`version` constants | `ECP_EXECUTION_LOAD`, `ECP_NOT_FOUND` |
| L1 Schema | Generated host schema: structure, node shapes, markers, step `input` against the capability's `accepts`, `$script` only at string positions, unknown capability ids | `ECP_MANIFEST_INVALID`, `ECP_CAPABILITY_UNKNOWN`, `ECP_INPUT_INVALID` |
| L2 Semantics | Unique ids, default arm last, `mode` needs `as`, `as` not an input name, `create` inside loop bodies, `expr`/`$expr` syntax, `$script` syntax and file, config ids exist and validate, no `$secret`/`$env` in the execution | `ECP_MANIFEST_INVALID`, `ECP_EXPR_INVALID`, `ECP_SCRIPT_INVALID`, `ECP_CONFIG_UNKNOWN`, `ECP_CONFIG_INVALID`, `ECP_COMMIT_CONFLICT` |
| L3 Data flow | Every `$ref` resolves in order, paths exist in `returns`/`accepts`, types fit, maybe-missing handling, parallel isolation, write conflicts, `execution.returns` keys produced | `ECP_REF_UNRESOLVED`, `ECP_REF_MAYBE_MISSING`, `ECP_REF_PATH_INVALID`, `ECP_TYPE_MISMATCH`, `ECP_COMMIT_CONFLICT`, `ECP_RETURNS_UNRESOLVED` |
| L4 Run input | Run `input` against `execution.accepts` (on `execute` only, after L0–L3) | `ECP_INPUT_INVALID` (path under `/input`) |

L1 and L2 issues are all reported together (no early stop within a layer). L3 runs only when
L1–L2 produced no errors, because data-flow analysis needs a structurally valid graph.

## Issue and result shapes

```ts
interface ValidationIssue {
  code: EcpErrorCode            // catalogue in 06
  severity: "error" | "warning"
  message: string               // one sentence, model-readable, names the offending value
  path: string                  // JSON Pointer into the manifest ("/steps/1/branches/0/steps/2/input/prompt"); "/input/..." for run input
  nodeId?: string               // id of the enclosing node
  line?: number; column?: number // for expr/$expr/$script syntax errors, relative to that source text
  expected?: unknown            // the relevant JSON Schema fragment (trimmed to 2 KB)
  actual?: unknown              // the offending value (trimmed to 1 KB, secrets never included)
  suggestions?: string[]        // concrete fixes: "did you mean 'text'?", "add \"optional\": true and a \"fallback\""
  available?: string[]          // ref errors: every valid ref path at this point, e.g. ["state.doc", "state.doc.width", ...] (max 50)
}
interface ValidationResult {
  valid: boolean                // no issues of severity "error"
  issues: ValidationIssue[]     // errors first, then warnings, each group ordered by document position
  manifestHash: string          // sha256 of canonical JSON (sorted keys) of the manifest
  schemaHash: string            // hash of the generated schema used (changes when plugins change)
}
```

Suggestions use Damerau–Levenshtein distance ≤ 2 (or prefix match) against the relevant
candidate set: capability ids, property names in `accepts`/`returns`, state keys, config ids.

## Generated host schema (L1)

Built by `engine` from the base manifest schema plus the plugin manifests whenever the plugin
set changes (host start). Rules that keep errors precise (proved by the prototype; mandatory):

1. **Nodes dispatch on `type`:** `if type=branch then Branch else if loop … else if parallel … else Step`. Never `oneOf`/`anyOf` across node kinds.
2. **Step input dispatches on `uses`:** `uses` is an `enum` of installed capability ids; `allOf` of `if { uses: const <id> } then { input: wrapped(accepts) }` per capability.
3. **Value markers dispatch on their key:** every value position in a wrapped `accepts` becomes `if required[$ref] then RefValue else if required[$expr] then ExprValue else if required[$state] then StateValue else <original>`, and at string positions additionally `if required[$script] then ScriptValue`.
4. Each capability's `returns` is attached as an annotation (`"x-ecp-returns"`) on its `then` branch, for tooling.
5. `$id` of the generated schema is `ecp://host/execution.schema.json`; its hash is `schemaHash`.

Performance rule: the host compiles **one base validator** (structure, all capabilities' input
wrappers referenced lazily) and **one input validator per capability**, compiled on first use
and cached by `schemaHash` + capability id. The full single-file schema is written to disk for
editors (`$ECP_HOME/schema/execution.schema.json`) and is not what the host compiles at
runtime. Ajv options: `allErrors: true`, `strict: false`, `useDefaults: false` (defaults apply
only to run input, L4, with `useDefaults: true` on a separate validator).

## Data-flow check (L3)

The checker walks the graph in execution order with an **environment**: a map from state key
to `{ schema, certainty: "definite" | "maybe", producer: nodeId | "input" }`.

**Start:** each `execution.accepts` property → `definite` if in `required` or it has a
`default`, else `maybe`.

**Step:**

1. For each `$ref` in `input` (and in `$script.params`): split `state.<key>.<rest>`.
   - `<key>` not in the environment → `ECP_REF_UNRESOLVED` (`available` lists the environment). If the key is produced by a parallel sibling line, the message says so.
   - `<key>` is `maybe` and the ref has neither `optional: true` nor `fallback` → `ECP_REF_MAYBE_MISSING` (error) with the suggestion to add `optional`/`fallback` or restructure.
   - Walk `<rest>` through the producer schema (`properties`, `items` for numeric segments, `additionalProperties` when it's a schema). Missing → `ECP_REF_PATH_INVALID` with suggestions from sibling property names. A schema with no `type` and no `properties` (unknown) stops the walk without error.
   - Type fit: compare the referenced schema's `type` set to the target position's `type` set in `accepts` (`integer` fits `number`; target without `type` accepts anything; `$expr` targets are unchecked). No overlap → `ECP_TYPE_MISMATCH` with `expected` and the referenced schema as `actual`.
2. If the step has `as`: record the key with the capability's `returns` schema, transformed by `mode`: `create`/`replace` → `returns`; `merge` → object merge of existing and `returns` properties; `append` → `{ type: "array", items: returns }`. Certainty `definite`, or `maybe` if the step has an `expr` gate or sits in a maybe context.
3. `mode: "create"` on a key that is already `definite` → `ECP_COMMIT_CONFLICT`.

**Branch:** check each arm from a copy of the entry environment. After the branch, a key
produced inside is `definite` only if produced (definite) in **every** arm **and** a default arm
exists; otherwise `maybe`. Differing schemas for the same key become `anyOf`.

**Loop:** check the body from a copy of the entry environment, with keys the body produces
pre-seeded as `maybe` (a later round sees an earlier round's output). After the loop, keys the
body produces are `maybe` (the loop can run zero rounds), unless they were already `definite`
before it. `create` mode on any `as` inside a loop body → `ECP_COMMIT_CONFLICT` (a second round
would fail); use `replace`/`append`/`merge`.

**Parallel:** check each line from a copy of the entry environment (no line sees another's
output). Two lines producing the same key → `ECP_COMMIT_CONFLICT`. After: the union of all
lines' outputs with their own certainty.

**End:** each `execution.returns` property must be in the environment: missing →
`ECP_RETURNS_UNRESOLVED` (error); `maybe` → warning with the same code.

**Not checked in the MVP:** the contents of `expr` and `$expr` functions (opaque JavaScript).

## Where validation runs

- `execute { mode: "validate" }` → L0–L3 (and L4 when `input` is given). Nothing runs.
- `execute` (run) → L0–L4 first; any error → no run is created; the response carries the result.
- `commit` of an execution → L0–L3; errors reject the commit (`ECP_MANIFEST_INVALID` envelope with the issues); warnings are stored with the object.
- `commit` of a config → validated against the plugin's config schema (`$secret`/`$env` objects allowed at any string position).
- Host start → regenerates schemas; saved executions are re-validated lazily on next use, not at start.

## Editor support

- `$ECP_HOME/schema/execution.schema.json`: the full generated schema, rewritten on every host
  start when `schemaHash` changes. `ecp schema` prints its path.
- Users add `"$schema": "<that path>"` to `.ecp.json` files (or a `json.schemas` mapping for
  `**/*.ecp.json`). Editors then complete capability ids, check inputs against `accepts`, and
  show plugin descriptions on hover.
