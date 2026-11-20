# 06 — Operations

Three operations, identical on every surface: MCP tools (`mcp-relay`), CLI commands (`cli`),
HTTP routes (`host`), and the in-process API (`engine` via `host`). Input and output JSON
Schemas live in `protocol` (`retrieve.input.schema.json`, …) and are the MCP tools'
`inputSchema`.

## Envelope

```ts
type OperationResponse<T> = { ok: true; data: T } | { ok: false; error: OperationError }
interface OperationError {
  code: EcpErrorCode; message: string
  path?: string; suggestions?: string[]
  issues?: ValidationIssue[]          // present for validation failures
  retryAfterMs?: number               // present for ECP_HOST_RESTARTING
}
```

A run that **fails** is still `ok: true` (the operation worked; `data.status` is `failed`).
`ok: false` means the operation itself was refused (bad request, invalid manifest, not found,
conflict, host problem).

## `retrieve`

```ts
interface RetrieveInput {
  type: "capability" | "execution" | "config" | "run" | "plugin" | "formatter" | "schema"
  id?: string                       // exactly one item, full detail
  query?: string                    // search (capability, execution, config); case-insensitive
  filter?: { plugin?: string; executionId?: string; status?: RunStatus; clientRequestId?: string }
  include?: Array<"steps" | "events" | "manifest" | "state" | "document">   // run extras; document = schema type only
  limit?: number                    // default 10, max 100
  format?: string                   // formatter id; default "@executioncontrolprotocol/formatters.json"
  output?: { path: string }         // write the full result to this file; respond with a summary
}
type RetrieveOutput =
  | { type: string; item: unknown }                         // with id
  | { type: string; items: unknown[]; total: number }       // without id
  | { type: string; format: string; text: string }          // non-JSON format
  | { type: string; written: { path: string; bytes: number }; summary: string }   // with output.path
```

- `id` and `query` are mutually exclusive; neither = list (most recent first for runs and
  executions, alphabetical otherwise), up to `limit`.
- Capability item = full capability entry (05). Search items = summaries.
- Execution item = `{ id, version, manifest, warnings, updatedAt }` (`manifest` always included
  for `id`). Path-referenced files are not "executions" for `retrieve`; read them from disk.
- Config item = the stored config object (references only).
- Run item = run record; `include: ["steps"]` adds step records, `["events"]` the events,
  `["state"]` the latest state.
- Plugin item = `{ package, id, version, source: "user" | "link" | "core", capabilities: [ids], loaded: boolean, manifestOk: boolean, issues? }`.
- Formatter items = `{ id, mediaType, default }`.
- Schema item = one object `{ id: "root" | <pluginId>, path, bytes, document? }` (type `schema` only).
  No `id` → root `$ECP_HOME/schema/execution.schema.json`. `id` → plugin id or package (same match
  as type `plugin`). `query`, `filter`, and `limit` are invalid (`ECP_REQUEST_INVALID`). Default
  response is `path` and `bytes` only. `include: ["document"]` adds parsed JSON when `bytes` ≤
  `262144` (`SCHEMA_DOCUMENT_INLINE_MAX_BYTES`); over the cap without `output.path` →
  `ECP_REQUEST_INVALID` (names `--out` / `output.path`). With `output.path`, write the full payload
  and return the usual `written` summary. Unknown plugin id or a missing editor file after the host
  write → `ECP_NOT_FOUND`.
- Not found → `ECP_NOT_FOUND` with suggestions of close ids.

**Matching (capability, execution, config):** tokenise the query (lowercase, split on
non-alphanumerics, drop 1-char tokens). Score each candidate: +5 per token found in the id,
+3 in summary/label, +1 in description/use cases; +3 bonus if all tokens match. Ties broken
by id. Results with score 0 are dropped. Deterministic; no embeddings in the MVP.

## `execute`

```ts
interface ExecuteInput {
  execution?: ExecutionManifest | { id: string } | { path: string } | { id: string; patch: PatchOp[] }
  input?: Record<string, unknown>    // run input, validated against execution.accepts
  mode?: "run" | "validate"          // default "run"
  wait?: boolean                     // default true
  waitTimeoutMs?: number             // default 120000 for MCP/HTTP, unlimited for CLI
  output?: { path: string }          // write the full run result to a file; respond with a summary
  clientRequestId?: string           // set by relay/CLI; dedup and recovery (09)
  resume?: string                    // runId; mutually exclusive with execution/cancel
  cancel?: string                    // runId; mutually exclusive with execution/resume
}
type ExecuteOutput =
  | { validation: ValidationResult }                                          // mode "validate"
  | { runId: string; status: RunStatus; validation: ValidationResult;
      result?: Record<string, unknown>; error?: ValidationIssue;
      steps: Array<{ nodeId: string; round?: number; status: StepStatus; durationMs?: number }>;
      warnings?: ValidationIssue[] }                                          // run
```

- Exactly one of `execution`, `resume`, `cancel`.
- `path`: absolute, or relative to the caller's working directory (the CLI and relay resolve it
  to absolute before sending). Must end with `.ecp.json`.
- Validation errors (any `error` severity) → `ok: false`, `ECP_MANIFEST_INVALID` (or the
  specific first code for L0/L4), `issues` = all issues. No run is created.
- `wait: false`, or a run still going at `waitTimeoutMs` → `{ runId, status: "running", … }`;
  poll with `retrieve { type: "run", id }`.
- `cancel` → `{ runId, status }` after the cancel settles (max 10 s).
- `id + patch` runs the patched manifest without saving it.

## `commit`

```ts
interface CommitInput {
  type: "execution" | "config"
  action: "create" | "update" | "delete"
  id?: string                        // required for update/delete; for create taken from object if absent
  object?: unknown                   // create: full object; update: full replacement (or use patch)
  patch?: PatchOp[]                  // update only; mutually exclusive with object
  ifVersion?: number                 // update/delete: required for executions and configs
}
type CommitOutput = { type: string; id: string; version: number | null; warnings?: ValidationIssue[] }   // version null after delete
```

- Executions validated L0–L3 before saving; errors → `ok: false`, `ECP_MANIFEST_INVALID`
  with `issues`.
- Configs validated against the plugin's config schema; plugin must be installed
  (`ECP_PLUGINS_MISSING` otherwise).
- Create on an existing id → `ECP_ALREADY_EXISTS`. Update/delete with a stale `ifVersion` →
  `ECP_VERSION_CONFLICT` (message includes the current version). Missing `ifVersion` on
  update/delete → `ECP_REQUEST_INVALID`.
- Other types (capability, run, plugin, formatter, schema) are read-only → `ECP_REQUEST_INVALID`.

## Patch format

RFC 6902 JSON Patch (`add`, `remove`, `replace`, `move`, `copy`, `test`) with one extension:
a path segment `@<nodeId>` selects the node with that id anywhere in the graph.

```json
[ { "op": "replace", "path": "/steps/@translate/input/prompt", "value": "Translate politely" },
  { "op": "add", "path": "/steps/@check-headline/branches/1/steps/-", "value": { "id": "log", "uses": "…" } } ]
```

`@<nodeId>` may appear once, as the first segment after `/steps` (it resolves to that node's
JSON object). Unknown id → `ECP_PATCH_INVALID`. A patch that fails to apply →
`ECP_PATCH_INVALID` naming the op index. The patched result is then validated as usual.

## Error codes

| Code | Severity / when | HTTP | CLI exit |
| --- | --- | --- | --- |
| `ECP_REQUEST_INVALID` | Operation input doesn't match its schema or rules | 400 | 2 |
| `ECP_EXECUTION_LOAD` | File unreadable, not JSON, wrong `schema`/`version` | 400 | 2 |
| `ECP_NOT_FOUND` | Unknown id (execution, config, run, capability, plugin) | 404 | 2 |
| `ECP_MANIFEST_INVALID` | Validation failed (see `issues`) | 422 | 2 |
| `ECP_CAPABILITY_UNKNOWN` | `uses` names no installed capability | 422 | 2 |
| `ECP_PLUGINS_MISSING` | Capability belongs to a known first-party plugin that isn't installed; message has the install command | 422 | 3 |
| `ECP_INPUT_INVALID` | Step input vs `accepts`, or run input vs `execution.accepts` | 422 | 2 |
| `ECP_REF_UNRESOLVED` | `$ref` to a key not produced before this point | 422 | 2 |
| `ECP_REF_MAYBE_MISSING` | `$ref` to a key that may not exist, without `optional`/`fallback` | 422 | 2 |
| `ECP_REF_PATH_INVALID` | `$ref` path not in the producer's schema | 422 | 2 |
| `ECP_TYPE_MISMATCH` | Referenced type can't fit the target | 422 | 2 |
| `ECP_COMMIT_CONFLICT` | Two writers for one key, `create` in a loop, `create` on an existing key | 422 / run-time | 2 / 1 |
| `ECP_RETURNS_UNRESOLVED` | `execution.returns` key never produced (error) or maybe (warning) | 422 | 2 |
| `ECP_EXPR_INVALID` | `expr`/`$expr` syntax | 422 | 2 |
| `ECP_SCRIPT_INVALID` | `$script` syntax, missing file, both/neither of source/path | 422 / run-time | 2 / 1 |
| `ECP_CONFIG_UNKNOWN` | Named config doesn't exist | 422 | 2 |
| `ECP_CONFIG_INVALID` | Config fails the plugin's config schema | 422 | 2 |
| `ECP_PATCH_INVALID` | Patch can't be applied | 422 | 2 |
| `ECP_ALREADY_EXISTS` | Create on an existing id | 409 | 2 |
| `ECP_VERSION_CONFLICT` | Stale `ifVersion` | 409 | 2 |
| `ECP_SECRET_MISSING` | Secret has no value (run-time) | — (in run) | 1 |
| `ECP_STEP_FAILED` | Capability threw | — (in run) | 1 |
| `ECP_STEP_TIMEOUT` | Capability exceeded its timeout | — (in run) | 1 |
| `ECP_OUTPUT_INVALID` | Output fails `returns` or isn't JSON | — (in run) | 1 |
| `ECP_EXPR_FAILED` | Expression threw or exceeded memory | — (in run) | 1 |
| `ECP_EXPR_TIMEOUT` | Expression exceeded 50 ms | — (in run) | 1 |
| `ECP_EXPR_RESULT_INVALID` | Non-boolean in a control position, or non-JSON value | — (in run) | 1 |
| `ECP_SCRIPT_FAILED` | Transform script threw or exceeded memory | — (in run) | 1 |
| `ECP_SCRIPT_TIMEOUT` | Transform script exceeded 1000 ms | — (in run) | 1 |
| `ECP_PLUGIN_LOAD_FAILED` | Plugin module failed to import or has no handler | — (in run) | 1 |
| `ECP_PROVIDER_ERROR` | Upstream provider (HTTP / cloud SDK) returned an error | — (in run) | 1 |
| `ECP_RUN_CANCELLED` | Run ended by cancel | — (in run) | 1 |
| `ECP_HOST_RESTARTING` | Host draining; retry after `retryAfterMs` | 503 | 4 |
| `ECP_HOST_UNAVAILABLE` | No host reachable and starting one failed | — | 4 |
| `ECP_UNAUTHORIZED` | Missing/wrong token, bad `Host`/`Origin` | 401 | 4 |
| `ECP_INTERNAL` | Bug; message includes a log reference | 500 | 1 |

**CLI exit codes:** `0` success (including a validation run that's valid, and a run that
completed); `1` the run failed/cancelled or an internal error; `2` invalid request or
manifest; `3` missing plugins; `4` host unavailable or unauthorized.

`ECP_PLUGINS_MISSING` vs `ECP_CAPABILITY_UNKNOWN`: the host ships a static map of first-party
plugin ids → package names (`protocol`); a `uses` whose plugin id is in that map but not
installed is `ECP_PLUGINS_MISSING` with `ecp plugins install <short>`; anything else is
`ECP_CAPABILITY_UNKNOWN` with suggestions.
