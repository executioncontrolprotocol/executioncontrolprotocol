# 04 — Executor

Lives in `engine`. Pure logic: all I/O (plugins, storage, secrets, expressions) goes through
services (07). One executor instance per host; many concurrent runs.

## Run lifecycle

```text
execute ─► validate (L0–L4) ─► create run (status: running) ─► run nodes ─► completed | failed | cancelled
                                                                   │
                                          host drain/crash ─► interrupted ─► execute { resume } ─► running …
```

Statuses: `running`, `completed`, `failed`, `cancelled`, `interrupted`. (`queued` is not used in
the MVP; runs start immediately.)

Before any node runs, the executor refuses a manifest that has `detached`
(`ECP_NODE_DETACHED`) and does not walk that array, even when the caller skipped validation.
`execute` still validates first and creates no run when that error is present (03, 06). This
check is the backstop for a caller that skips validation.

## State

- A JSON object. Initial state = run input after `execution.accepts` validation with defaults
  applied (L4).
- Only `as` commits and `$state` handle writes change state.
- The state is persisted to `state.json` after every committed step (05), so a run can resume.
- Values must stay JSON-serialisable; a capability returning non-JSON (functions, `undefined`
  at top level, `BigInt`, cycles) fails with `ECP_OUTPUT_INVALID`. Binary data travels as file
  references (08).

## Node semantics

**Sequence:** nodes in an array run in order.

**Step:**

1. Resolve `input` (below).
2. Resolve config (below).
3. Validate the resolved input with Ajv against step `accepts` when `contract` is `"step"`, else
   the capability's `accepts` → `ECP_INPUT_INVALID`.
4. When `code` is `"script"`: resolve the step `script` to source (no `const params =` prefix),
   run it in QuickJS with a frozen `input` clone only (limits from `HostSettings.transform`:
   default 1000 ms, 32 MiB memory, 4 MiB result). The plugin handler is not called. Thrown
   script → `ECP_SCRIPT_FAILED`; transform timeout → `ECP_SCRIPT_TIMEOUT`.
   When `code` is `"expression"`: call `PluginAdapter.call` with resolved `input` and
   `context.expression` (same step timeout as other plugin calls).
   Otherwise: call the capability through `PluginAdapter.call` with an `AbortSignal` and the step
   timeout (capability `timeoutMs` from its manifest, else the host default 600 000 ms) →
   `ECP_STEP_TIMEOUT` on timeout. A thrown error → `ECP_STEP_FAILED` with the original message
   and, if present, the error's `code` and `details`.
5. Validate the output with Ajv against step `returns` when `contract` is `"step"`, else the
   capability's `returns`. `"returns": {}` skips the schema check but the value must still be
   JSON → `ECP_OUTPUT_INVALID` on mismatch or non-JSON.
6. Redact (below), then commit atomically: staged `$state` writes in order, then the `as`
   output by `mode`. Persist the step record and `state.json`.

Conditional steps use an enclosing `if` node; there is no step-level gate.

**Commit modes** (on `as`):

| Mode | Effect |
| --- | --- |
| `create` (default) | Set `state[as]`; if it already exists → fail `ECP_COMMIT_CONFLICT` |
| `replace` | Set `state[as]` |
| `merge` | Output must be a plain object → `state[as] = { ...state[as], ...output }` (shallow); otherwise `ECP_COMMIT_CONFLICT` |
| `append` | `state[as] = [...(Array.isArray(state[as]) ? state[as] : []), output]` |

Staged `$state` writes use `ctx.store.set | replace | merge | append(handle, value)` with the
same meanings at the handle's path (`set` = `replace`). They are applied before the `as` commit,
in call order, and discarded if the step fails.

**Uniform capture (F6):** after output passes `returns` validation and before staged writes and
`as` commit, the executor walks the output for `FileRef` shapes. When `persist` is not `false`,
each ref is copied into `ArtifactStore` through the host-injected file service (`url` download,
`file` copy, `artifact` record only). Successful captures add optional `archive` on the ref
while keeping its `kind`. Failures append `captured[].error`, emit `step.warning`, and do not
fail the step.

**`if`:** resolve `input`, evaluate `expression` or `script` over frozen `input`. `true` runs
`then`; `false`, a throw, a missing optional input, or a non-boolean result runs `else` when
present; otherwise nothing runs. Event `if.select` with `side` (`"then"` / `"else"` / `null`) and
`reason` (`"true"` / `"false"` / `"throw"` / `"missing"` / `"non-boolean"`). When `as` is set and
the chosen side runs, the resolved `input` is written to `state.<as>` for the duration of that
side (scoped; removed in `finally`, including after resume once the side finishes).

**Loop `while` (default):** `round = 0`; while `round < maxRounds`: run the body, evaluate `end`
(gather + read `repeat`). `true` `repeat` runs another round; `false`, a throw, missing
`repeat`, or a non-boolean `repeat` stops (soft — no run failure). Event `loop.round` each round,
`loop.repeat` after each `end`, and `loop.exhausted` when the cap is reached with
`rounds === maxRounds`. Optional `into` receives the last gathered value.

**Loop `for`:** read `input.count` once (non-negative integer `0..1000`; else
`ECP_TYPE_MISMATCH` / `ECP_LIMIT_EXCEEDED`). For each iteration, bind `state.<as>` to the index,
run the body on shared state, gather via `end`, emit `loop.round`, then remove `state.<as>` when
the loop ends (including after resume). Optional `into` receives the last gathered value when
count `> 0`.

**Loop `forEach`:** read `input.items` once (must be an array; more than 10 000 items →
`ECP_LIMIT_EXCEEDED`) and snapshot the state. Each item runs the body on its own deep copy of
that snapshot plus `state.<as>` and `state.<as>Index`; body commits stay in the copy and
`state.json` is not written for them. After the body, gather via `end` (`value` or
`expression` / `script`; a throw fails the item). Up to `concurrency` items (1–32, default 1) run
at once, started in index order. When every item has finished, `state.<into>` = the results in
item order (`create`), then `state.json` is written. `onError: "fail"` (default): stop starting
items, let running ones finish, fail with the lowest-index error, commit nothing. `"continue"`:
failed item → `null`, append to `state.<into>Errors`. Step records inside `forEach` carry `items`
(outermost first). Nested `forEach` snapshots the outer item; nested `while`/`for` use the item
copy.

`while` / `for` step records are keyed `<nodeId>#<round>` (rounds from 0); `forEach` uses
`<nodeId>#i<index>`.

**`parallel`:** optional scoped `as` (same rules as `if`). Run each path as a sequence, at most
`maxConcurrency` paths at a time (paths start in array order). Paths share the run's state object;
validation (03) guarantees they don't read each other's outputs or write the same key. If a path
fails: abort the other paths (`AbortSignal`), wait for them to settle, fail the run with the
first error. Steps aborted this way get status `cancelled`.

## Value resolution (input and `$script.params`)

Recursive over the JSON value, depth-first, object keys in insertion order:

- `$ref`: read the path from state. Missing (any segment `undefined`) → if `optional`: use
  `fallback` when present, else omit the property (or `null` when inside an array); if not
  optional → fail `ECP_REF_UNRESOLVED` (run-time; the validator should have caught most cases).
- `$state`: becomes `{ "$state": "<path>" }` handle object passed through untouched.
- `$script`: resolve `params`, read `source` or the file at `path`, syntax-check (02), produce
  `const params = <JSON.stringify(params)>;\n<script text>`. Errors: `ECP_SCRIPT_INVALID`.
- Anything else: copied.

Relative paths on a `file` ref in capability input are not resolved here (the path may still
be a `$ref` that becomes a string at run time). The host's file service (`files.bytes`, with
`read` as an alias) resolves them when the handler activates a ref. Sniff corrections appear on
the step record as `mediaTypes`. Scratch copies for `path` activation on url refs are released
when the step ends (success, failure, or cancel).
plugin reads the ref: absolute paths are used as-is; relative paths join the **execution
directory** (the directory of the `.ecp.json` when the run started by path, or
`executions/<id>.ecp.json` when started by id—the same directory `$script.path` uses). An inline
execution (no file) rejects a relative path at read time with `ECP_INPUT_INVALID` and a message
that names the path and requires an absolute path. `..` is allowed to the same degree as for
`$script`; this is not a sandbox.

## Expressions

Through the `ExpressionEngine` service (QuickJS in the MVP):

- `evaluateExpression(source, input)` evaluates one JavaScript expression with a deep-frozen
  `input` clone (no function-of-state form).
- `evaluateScript(source, input)` runs a transform-style script body with the same frozen `input`.
- Limits per evaluation: 50 ms CPU (interrupt handler), 32 MB memory, 1 MB result. Breach →
  `ECP_EXPR_TIMEOUT` / `ECP_SCRIPT_TIMEOUT` and related codes.
- A thrown error inside the sandbox → `ECP_EXPR_FAILED` / `ECP_SCRIPT_FAILED`.
- No host globals beyond QuickJS built-ins (`Date`, `Math.random` exist; executions should not
  rely on them). `process`, `require`, and `fetch` are undefined.
- Non-boolean results from `if` conditions are treated as failure (take `else`); other positions
  receive the value as-is.

## Config and secrets resolution (per step)

1. Config id = `step.config` or `<plugin-short>/default` if that object exists, else none.
2. Load the config object (05). Missing explicit id → `ECP_CONFIG_UNKNOWN`.
3. Resolve `{ "$secret": "<key>" }` through `SecretsProvider.get` and `{ "$env": "<NAME>" }`
   through the host's environment. Missing → `ECP_SECRET_MISSING` (names the key and the
   `ecp config secrets set` command).
4. Validate the resolved config against the plugin's config schema → `ECP_CONFIG_INVALID`.
5. Pass the resolved config to the capability call. Record only `{ id, version }` in the step
   record.

## Redaction

The executor keeps the set of secret values resolved in this run. Before writing anything to
state, step records, events, logs or responses, every string equal to or containing one of
those values has the value replaced with `[redacted]` (recursively through objects/arrays).
This includes capability outputs (a plugin echoing a key back).

## Failure

- Any step failure fails the run: status `failed`, `error` = the step's error issue (with
  `nodeId` and `path`), remaining nodes don't run. There are no try/catch nodes in the MVP.
- The executor never retries capability calls. Technical retries belong in plugins.
- Failures are values, not exceptions, at the API boundary: `execute` returns a run with
  status `failed` and the error; HTTP still answers 200 for a run that failed (the operation
  succeeded). See 06.

## Cancellation

`execute { cancel: runId }` aborts the run's `AbortSignal`. In-flight capability calls receive
the abort; the run ends `cancelled` once they settle (or after 10 s, whichever first). Nodes
not started are not run. A `forEach` loop stops starting items, aborts running ones and does not
commit `into`.

## Resume

- On host start, runs left `running` become `interrupted` (event `run.interrupted`).
- On drain timeout, the host marks still-running runs `interrupted` before exiting (09).
- `execute { resume: runId }` (status must be `interrupted`; else `ECP_REQUEST_INVALID`):
  reload the manifest **by hash** (the run record stores the manifest copy), load `state.json`,
  skip every node recorded as completed or skipped, and re-run the node that was in progress
  from scratch (its staged writes were never committed). Loop round counters and `if` side
  choices (`cursor.choices`) are restored from the run record. Scoped `as` values from an
  interrupted `if` remain in saved state until the side completes. The same run id continues; event
  `run.resume`.
- `forEach` mode: the outermost `forEach` loop records each finished item's result in
  `runs/<id>/loop-items/<nodeId>.json` (05). On resume, recorded items are skipped and their results
  reused; an item that was running restarts from its first step (its writes lived only in its copy).
  A nested `forEach` keeps no file: a crash inside it restarts the outer item.
- A capability that is not idempotent may repeat side effects for the re-run node; this is
  documented behaviour, surfaced in the `run.resume` event data (`rerunNodeId`).

## Events (emitted to the run's `events.ndjson` and to `/watch` subscribers)

| Type | Data |
| --- | --- |
| `run.start` | `executionId?`, `path?`, `manifestHash`, `input` (redacted) |
| `step.start` | `nodeId`, `round?`, `item?`, `items?`, `capabilityId` |
| `step.skip` | `nodeId`, `round?`, `item?`, `items?` |
| `step.end` | `nodeId`, `round?`, `item?`, `items?`, `durationMs`, `as?` |
| `step.error` | `nodeId`, `round?`, `item?`, `items?`, `error` (issue) |
| `if.select` | `nodeId`, `side` (`"then"` / `"else"` / `null`), `reason` |
| `loop.round` | `nodeId`, `round` (`while`, `for`) |
| `loop.repeat` | `nodeId`, `round`, `again`, `reason?` (`while`, after each `end`) |
| `loop.exhausted` | `nodeId`, `rounds` (`while` only) |
| `loop.start` | `nodeId`, `count` (`forEach`) |
| `loop.item.start` | `nodeId`, `index` |
| `loop.item.end` | `nodeId`, `index`, `durationMs` |
| `loop.item.error` | `nodeId`, `index`, `error` (issue) |
| `loop.end` | `nodeId`, `count`, `failed` |
| `run.interrupted` | `reason` (`host-restart` / `host-crash`) |
| `run.resume` | `rerunNodeId?` |
| `run.end` | `status`, `durationMs`, `error?` |

Every event: `{ "ts": ISO-8601, "seq": n, "runId", "type", ... }`; `seq` is per run, strictly
increasing.

## Timing

With `ECP_TIMING=1` the host/CLI prints (stderr) and records in the run record:
`process.start`, `manifest.load`, `schema.compile`, `validate`, per step `plugin.import`,
`config.resolve`, `call`, `commit`.
