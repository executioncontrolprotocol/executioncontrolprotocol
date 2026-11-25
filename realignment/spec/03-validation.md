# 03 — Validation

The host is the only authority on whether an execution is valid. Every surface (MCP, CLI, HTTP,
App) gets the same `ValidationResult`, so an agent can fix and resubmit in a loop.

## Layers (run in this order; later layers run only if earlier ones have no errors)

| Layer | Checks | Codes |
| --- | --- | --- |
| L0 Load | JSON parse, file exists, `schema`/`version` constants | `ECP_EXECUTION_LOAD`, `ECP_NOT_FOUND` |
| L1 Schema | Base structure + per-step raw `accepts` + marker filter: node shapes, marker syntax, step `input` against step `accepts` when `contract` is `"step"` else the capability's raw `accepts`, `$script` only at string positions (input markers), unknown capability ids | `ECP_MANIFEST_INVALID`, `ECP_CAPABILITY_UNKNOWN`, `ECP_INPUT_INVALID` |
| L2 Semantics | Unique ids, step `mode` needs `as`, `as` not an execution input name, `create` inside `while`/`for` loop bodies, `if` exactly one of `expression`/`script` and non-empty `then`, `as` on `if`/`parallel` requires `input`, `parallel` has at least two non-empty `paths`, loop per-mode fields (`input.items` / `input.count`, `end`, `into`, `repeat` on while `end` only, no `as` on while), `if`/`end` expression syntax, no `$expr` in `input` or `$script.params`, `$script` syntax and file (input markers only), transform plain `script` has `lang: "js"`, one of `source`/`path`, no `params` and no `$script` wrapper; step `accepts`/`returns` required iff `contract` is `"step"`, forbidden otherwise; `script`/`expression` presence matches capability `code`; config ids exist and validate, no `$secret`/`$env` in the execution; old node shapes (`branch`, step `expr`, loop `ref`/`collect`, `parallel.branches`) → schema rejection | `ECP_MANIFEST_INVALID`, `ECP_EXPR_INVALID`, `ECP_SCRIPT_INVALID`, `ECP_CONFIG_UNKNOWN`, `ECP_CONFIG_INVALID`, `ECP_COMMIT_CONFLICT`, `ECP_NODE_DETACHED` |
| L3 Data flow | Every `$ref` resolves in order, paths exist in `returns`/`accepts`, types fit, maybe-missing handling, parallel isolation, write conflicts, `execution.returns` keys produced | `ECP_REF_UNRESOLVED`, `ECP_REF_MAYBE_MISSING`, `ECP_REF_PATH_INVALID`, `ECP_TYPE_MISMATCH`, `ECP_COMMIT_CONFLICT`, `ECP_RETURNS_UNRESOLVED` |
| L4 Run input | Run `input` against `execution.accepts` (on `execute` only, after L0–L3) | `ECP_INPUT_INVALID` (path under `/input`) |

L1 and L2 issues are all reported together (no early stop within a layer). L3 runs only when
L1–L2 produced no errors, because data-flow analysis needs a structurally valid graph.

A `detached` entry is an L2 error: `ECP_NODE_DETACHED` at `/detached/<i>`, message
"Step `<id>` isn't connected to the flow", suggestion "Reconnect it or delete it", one issue
per entry. That step still gets every other per-step check (ids unique across `steps` and
`detached`, `uses` installed, input schema, config). L3 does not run while this error stands.
`detached` steps are outside the flow: they produce nothing, and their own reads are not
checked.

## Issue and result shapes

```ts
interface ValidationIssue {
  code: EcpErrorCode            // catalogue in 06
  severity: "error" | "warning"
  message: string               // one sentence, model-readable, names the offending value
  path: string                  // JSON Pointer into the manifest ("/steps/1/then/0/input/prompt"); "/input/..." for run input; "" means the whole document (for example not JSON)
  nodeId?: string               // id of the enclosing node
  line?: number; column?: number // for expr/$expr/$script syntax errors, relative to that source text
  expected?: unknown            // the relevant JSON Schema fragment (trimmed to 2 KB)
  actual?: unknown              // the offending value (trimmed to 1 KB, secrets never included)
  suggestions?: string[]        // concrete fixes: "did you mean 'text'?", "add \"optional\": true and a \"fallback\""
  available?: string[]          // ref errors: every valid ref path at this point, e.g. ["state.doc", "state.doc.width", ...] (max 50)
}
Issues are unique by `code`, `path`, `message`, and `severity`. Every issue's `path` is a string.

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

The host validates executions in two stages. Rules that keep errors precise (mandatory):

1. **Nodes dispatch on `type`:** `if type=if then If else if loop … else if parallel … else Step`. Never `oneOf`/`anyOf` across node kinds. The loop subschema enforces `mode` and per-mode fields with `if`/`then`. This lives in the base execution schema shipped in `protocol`.
2. **Base structure only at compile time:** the host compiles **one** base document validator (node shapes, marker object syntax via `$defs/value`, ids, `uses` as a string matching the capability-id pattern). It never inlines capability `accepts` and never enumerates installed capability ids in the schema. Unknown `uses` values are an engine check (`ECP_CAPABILITY_UNKNOWN` / `ECP_PLUGINS_MISSING`) with suggestions.
3. **Per-step input against raw `accepts`:** for each step whose `uses` is installed, the host validates `input` against that capability's raw `accepts` schema (from the plugin's `ecp.schema.json`, loaded lazily). Markers are not wrapped into the schema. The engine walks `input`, records marker JSON Pointers, runs the raw validator, and **drops only errors explained by a marker**: errors at or under a marker position; `additionalProperties` naming a marker key; `anyOf`/`oneOf` failures where some branch's errors are all explained (matched by `schemaPath` prefix). Remaining input errors are `ECP_INPUT_INVALID`. Two rules that keep equivalence with today's wrapped path: (a) on an object schema without `additionalProperties: false`, an undeclared property accepts any value, so a `$script` there is allowed; (b) marker syntax (e.g. `$script` needs `lang: "js"` and exactly one of `source`/`path`) is still validated by the base schema's marker defs, independently of `accepts`.
4. **`$script` positions:** resolve the raw subschema at the marker's path; the position is valid only if that subschema accepts a string (or is an open schema). Otherwise `ECP_SCRIPT_INVALID`. Setting both `source` and `path` on a `$script` object is a single `ECP_SCRIPT_INVALID` (not a schema oneOf failure). Inline `$expr` in `input` or `$script.params` → `ECP_EXPR_INVALID`.
5. **`$secret` / `$env` in an execution:** emit one dedicated `ECP_MANIFEST_INVALID` per occurrence (message and suggestion per spec 02); do not leave "boolean schema is false" as the only signal.
6. Each capability's `returns` remains available to tooling and L3 from the plugin schema document (`$defs/<name>.returns`), loaded lazily when needed. Editor-only annotations may attach `x-ecp-returns` on editor dispatch branches.
7. **`schemaHash`:** hash of the base schema plus the sorted hashes of every installed plugin's `ecp.schema.json` (plugin id + version). It changes when plugins or their schema documents change.

Performance rule: the host compiles **one base validator** at start (or first validation in-process) and **one input validator per capability**, compiled on first use of that capability's plugin schema document and cached for the host lifetime (keyed by plugin version / schema document hash + capability name). Plugin schema documents are added to Ajv lazily on first use of any of that plugin's capabilities. The editor schema files under `$ECP_HOME/schema/` are not what the host compiles for runtime validation. Ajv options: `allErrors: true`, `strict: false`, `useDefaults: false` (defaults apply only to run input, L4, with `useDefaults: true` on a separate validator).

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
   - Type fit: compare the referenced schema's `type` set to the target position's `type` set in `accepts` (`integer` fits `number`; target without `type` accepts anything). No overlap → `ECP_TYPE_MISMATCH` with `expected` and the referenced schema as `actual`.
   - **File access (F4):** when the target schema has `x-ecp-file.access: "url"`, a literal ref must be `kind: "url"`, and a bound producer schema must not allow any other kind. Binding a full `FileRef` union or a literal `file` / `artifact` ref → `ECP_TYPE_MISMATCH` with a suggestion to publish the file first (for example `@executioncontrolprotocol/azure-blob-storage.upload`) and bind its `file` output. A source with no kind information (for example a transform with `returns: {}`) is not rejected here; the run-time check below catches a wrong kind. When `x-ecp-file.mediaTypes` is set, a literal `mediaType` on the ref must match (`type/*` wildcards allowed); omitted `mediaType` skips the check. The host re-checks on resolved step input with an Ajv `x-ecp-file` keyword (`ECP_INPUT_INVALID` with the same suggestion).
2. If the step has `as`: record the key with the capability's `returns` schema, transformed by `mode`: `create`/`replace` → `returns`; `merge` → object merge of existing and `returns` properties; `append` → `{ type: "array", items: returns }`. Certainty `definite`, or `maybe` if the step sits in a maybe context.
3. `mode: "create"` on a key that is already `definite` → `ECP_COMMIT_CONFLICT`.

**`if`:** when `as` is set, add `state.<as>` (typed from `accepts`, `definite`) for the `then` and
`else` sides only; it is not visible after the `if`. Refs to `state.<as>` outside the sides →
`ECP_REF_UNRESOLVED`. Scoped `as` must not collide with an execution input name, a key already in
the entry environment, or an enclosing loop's `as` / `<as>Index` → `ECP_COMMIT_CONFLICT`. Check each
side from the scoped environment. After the `if`, a key produced inside is `definite` only when
produced (definite) on **both** sides; with no `else`, keys from `then` only are `maybe`.

**Loop (`while`, default):** `end.input.repeat` refs are checked in the entry environment (boolean
when the producer schema is known). Check the body from a copy of the entry environment. After the
loop, keys the body produces unconditionally are `definite` (the body runs at least once). Optional
`into` is `maybe`. `create` in the body → `ECP_COMMIT_CONFLICT`.

**Loop (`for`):** `input.count` must be an integer (`ECP_TYPE_MISMATCH` when known and not integer).
The body is checked with `<as>` (integer, `definite`) added; `<as>` must not already exist in the
entry environment (`ECP_COMMIT_CONFLICT`). Same shared-state / `create`-forbidden rules as `while`.
After the loop, `into` is `maybe` (count may be `0`).

**Loop (`forEach`):** `input.items` must be an array (`ECP_TYPE_MISMATCH` when known and not an array).
Element type comes from the items schema when known. The body is checked from a copy of the entry
environment plus `<as>` (element schema) and `<as>Index` (integer), both `definite`; either key
already present → `ECP_COMMIT_CONFLICT`. `create` is allowed in the body (nested `while`/`for`
still forbid it). `end.input` refs (including `value`) are checked in the body's environment.
After the node, `<into>` (array of gathered results, or elements / `null` with `onError: "continue"`)
and `<into>Errors` with `"continue"` are added; either already `definite` → `ECP_COMMIT_CONFLICT`.

**`parallel`:** check each path from a copy of the entry environment (no path sees another's
output). A ref to a commit from another path → `ECP_REF_UNRESOLVED` (parallel sibling). Two paths
producing the same key → `ECP_COMMIT_CONFLICT`. Scoped `as` on the parallel node follows the same
rules as on `if`. After: the union of all paths' outputs with their own certainty.

**Pointer forms** for nested nodes: `/then/…`, `/else/…`, `/paths/<n>/…`, `/steps/…` (loop body),
`/end/…` (loop gather inputs and expression).

**End:** each `execution.returns` property must be in the environment: missing →
`ECP_RETURNS_UNRESOLVED` (error); `maybe` → warning with the same code.

**Not checked in the MVP:** the run-time result of opaque `if` / `end` expressions beyond syntax.

## Where validation runs

- `execute { mode: "validate" }` → L0–L3 (and L4 when `input` is given). Nothing runs.
- `execute` (run) → L0–L4 first; any error → no run is created; the response carries the result.
- `commit` of an execution → L0–L3. Without `draft`, errors reject the commit
  (`ECP_MANIFEST_INVALID` envelope with the issues); warnings are stored with the object.
  With `draft: true`, the document must load (L0) and pass the base structure schema; every
  other error (unknown capability, step input vs `accepts`, L2, L3) is stored and returned in
  `issues` (06). `execute` is unchanged: any error refuses the run.
- `commit` of a config → validated against the plugin's config schema (`$secret`/`$env` objects allowed at any string position).
- Host start → regenerates schemas; saved executions are re-validated lazily on next use, not at start.

## Editor support

- `$ECP_HOME/schema/execution.schema.json`: a small root dispatch rewritten when `schemaHash`
  changes. Per-plugin editor schema files live beside it under `schema/plugins/`. Root dispatch
  use relative `$ref`s to `#/$defs/<name>.editorInput` (marker-wrapped `accepts`). `ecp retrieve --type schema`
  prints the root path; `include=document` returns the parsed document.
- Users add `"$schema": "<root file URL>"` to `.ecp.json` files (an absolute `file:///` URL;
  editors don't expand `~`), or a `json.schemas` mapping for `**/*.ecp.json`. Editors then
  complete capability ids with their summaries (`enumDescriptions`), check inputs against
  `accepts`, and show summaries on hover.
- Editor files carry no `$id`, so relative `$ref`s resolve against their location on disk.
  Per-plugin file names use only `[A-Za-z0-9.~-]` plus `_xx` hex escapes, because editors
  URL-decode `$ref`s (a `%2F` would become a path separator). Marker `$ref`s in plugin files
  point at the root (`../execution.schema.json#/$defs/refValue`). Rejections carry an
  `errorMessage` so editors show the same guidance as `ecp execute --validate`.
