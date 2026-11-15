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

1. If `expr` is present: evaluate (control). `false` → status `skipped`, event `step.skip`, no
   commit. Non-boolean → fail `ECP_EXPR_RESULT_INVALID`.
2. Resolve `input` (below).
3. Resolve config (below).
4. Validate the resolved input against the capability's `accepts` → `ECP_INPUT_INVALID` (this
   catches values that only exist at run time, like a ref'd value of the wrong shape).
5. Call the capability through `PluginAdapter.call` with an `AbortSignal` and the step timeout
   (capability `timeoutMs` from its manifest, else the host default 600 000 ms) →
   `ECP_STEP_TIMEOUT` on timeout. A thrown error → `ECP_STEP_FAILED` with the original message
   and, if present, the error's `code` and `details`.
6. Validate the output against `returns` → `ECP_OUTPUT_INVALID`.
7. Redact (below), then commit atomically: staged `$state` writes in order, then the `as`
   output by `mode`. Persist the step record and `state.json`.

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

**Branch:** evaluate arm `expr`s in order (control); run the first `true` arm; else the default
arm; else nothing. Event `branch.select` with the arm index (or `null`).

**Loop:** `round = 0`; while `round < maxRounds` and `expr(state) === true`: run the body,
`round++`. Event `loop.round` per round; `loop.exhausted` when it stops because of `maxRounds`.
Step records inside loops are keyed `<nodeId>#<round>` (rounds start at 0).

**Parallel:** run each line as a sequence, at most `maxConcurrency` lines at a time (lines start
in array order). All lines share the run's state object; validation (03) guarantees they don't
read each other's outputs or write the same key, so commits are safe (single-threaded JS).
If a line fails: abort the other lines (`AbortSignal`), wait for them to settle, fail the run
with the first error. Steps aborted this way get status `cancelled`.

## Value resolution (input and `$script.params`)

Recursive over the JSON value, depth-first, object keys in insertion order:

- `$ref`: read the path from state. Missing (any segment `undefined`) → if `optional`: use
  `fallback` when present, else omit the property (or `null` when inside an array); if not
  optional → fail `ECP_REF_UNRESOLVED` (run-time; the validator should have caught most cases).
- `$expr`: evaluate with the current state (value position). Result must be JSON
  (`ECP_EXPR_RESULT_INVALID` otherwise).
- `$state`: becomes `{ "$state": "<path>" }` handle object passed through untouched.
- `$script`: resolve `params`, read `source` or the file at `path`, syntax-check (02), produce
  `const params = <JSON.stringify(params)>;\n<script text>`. Errors: `ECP_SCRIPT_INVALID`.
- Anything else: copied.

## Expressions

Through the `ExpressionEngine` service (QuickJS in the MVP):

- The state is passed as JSON (serialised once per evaluation) and deep-frozen inside the VM.
- The function is called with the state as its only argument; the result is serialised back.
- Limits per evaluation: 50 ms CPU (interrupt handler), 32 MB memory, 1 MB result. Breach →
  `ECP_EXPR_TIMEOUT` / `ECP_EXPR_FAILED`.
- A thrown error inside the function → `ECP_EXPR_FAILED` with the JS error message.
- No host objects are exposed: no `require`, `process`, `fetch`, timers, or file access.
  `Date` and `Math.random` exist (QuickJS built-ins); executions should not rely on them.

## Config and secrets resolution (per step)

1. Config id = `step.config` or `<plugin-short>/default` if that object exists, else none.
2. Load the config object (05). Missing explicit id → `ECP_CONFIG_UNKNOWN`.
3. Resolve `{ "$secret": "<key>" }` through `SecretsProvider.get` and `{ "$env": "<NAME>" }`
   through the host's environment. Missing → `ECP_SECRET_MISSING` (names the key and the
   `ecp secrets set` command).
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
not started are not run.

## Resume

- On host start, runs left `running` become `interrupted` (event `run.interrupted`).
- On drain timeout, the host marks still-running runs `interrupted` before exiting (09).
- `execute { resume: runId }` (status must be `interrupted`; else `ECP_REQUEST_INVALID`):
  reload the manifest **by hash** (the run record stores the manifest copy), load `state.json`,
  skip every node recorded as completed or skipped, and re-run the node that was in progress
  from scratch (its staged writes were never committed). Loop round counters and branch
  selections are restored from the run record. The same run id continues; event `run.resume`.
- A capability that is not idempotent may repeat side effects for the re-run node; this is
  documented behaviour, surfaced in the `run.resume` event data (`rerunNodeId`).

## Events (emitted to the run's `events.ndjson` and to `/watch` subscribers)

| Type | Data |
| --- | --- |
| `run.start` | `executionId?`, `path?`, `manifestHash`, `input` (redacted) |
| `step.start` | `nodeId`, `round?`, `capabilityId` |
| `step.skip` | `nodeId`, `round?` |
| `step.end` | `nodeId`, `round?`, `durationMs`, `as?` |
| `step.error` | `nodeId`, `round?`, `error` (issue) |
| `branch.select` | `nodeId`, `arm` (index or `null`) |
| `loop.round` | `nodeId`, `round` |
| `loop.exhausted` | `nodeId`, `rounds` |
| `run.interrupted` | `reason` (`host-restart` / `host-crash`) |
| `run.resume` | `rerunNodeId?` |
| `run.end` | `status`, `durationMs`, `error?` |

Every event: `{ "ts": ISO-8601, "seq": n, "runId", "type", ... }`; `seq` is per run, strictly
increasing.

## Timing

With `ECP_TIMING=1` the host/CLI prints (stderr) and records in the run record:
`process.start`, `manifest.load`, `schema.compile`, `validate`, per step `plugin.import`,
`config.resolve`, `call`, `commit`.
