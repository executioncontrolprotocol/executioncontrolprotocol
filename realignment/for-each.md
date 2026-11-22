# Per-item execution: `forEach`, CSV input, and rate limits

**Status:** design agreed 2026-11-22; implementation plan to follow. **Origin:** the banner-variants use case — one
PSD template, a CSV of variants (title, subtitle, background filename), a set of background files, and several
artboard sizes: every row becomes a variant, every variant a set of renditions. ECP's `loop` is condition-based (no
item, no index) and `parallel` only takes a fixed set of branches, so per-item work had no first-class shape.

## Principles

1. **Per-item work is a node.** Running the same steps once per item of an array is a graph node (`forEach`) with a
   body, visible in the App, validated like any other node — not a loop over a hand-rolled queue in state.
2. **Each item runs in its own scope.** An item's steps see the state as it was when the `forEach` started, plus the
   item; what they write stays in the item's scope. Items can't see or overwrite each other, which is what makes
   running them concurrently safe and the results deterministic.
3. **The `forEach` ends by collecting.** When every item has finished, one value per item (in item order) is
   committed to state as an array; the steps after the `forEach` see only that. That is where results are gathered
   before moving on.
4. **Concurrency is configurable and bounded.** How many items run at once, and how fast items start, are set on the
   node, so a workflow can respect a provider's limits. A provider-wide request limit belongs to that provider's
   plugin config, because only the plugin sees every request from every step and every run.
5. **Data comes in as data.** A CSV file is parsed by a capability (a node), not by hand in a transform; transforms
   then reshape rows like any other JSON.

## Decisions

| # | Decision |
| --- | --- |
| E1 | **`forEach` node:** `{ "type": "forEach", "id", "items": { "$ref" }, "as": "<name>", "steps": [...], "collect": { "$ref": "state.<key>" }, "into": "<key>", "concurrency"?, "throttle"?, "onError"? }`. `items` resolves to an array; inside the body the current item is `state.<as>` and its zero-based index `state.<as>Index`. |
| E2 | **Scope:** each item runs on a copy of the state at the `forEach`'s start plus `<as>` / `<as>Index`; body writes go to that copy only. After the item finishes, the value at `collect` (resolved in the item's scope) is its result. |
| E3 | **Collect:** when all items have finished, `state.<into>` = results in item order (`mode: create` semantics for `into`). Validation types `into` as an array of `collect`'s schema. |
| E4 | **Concurrency:** `concurrency` (integer ≥ 1, default 1) items run at once. `throttle: { "starts": n, "perSeconds": s }` caps how many items may *start* in any `s`-second window. Both are per `forEach`. |
| E5 | **Errors:** `onError: "fail"` (default) stops starting new items, lets running ones finish, then fails the step with the first item's error. `"continue"` records `null` for a failed item's result and adds `{ index, error }` to `state.<into>Errors`. |
| E6 | **Records and resume:** step records inside a `forEach` are keyed by item (`<nodeId>#<index>`), like loop rounds; captured artifacts carry the index in their names. Resume skips items whose results are recorded. Events: `forEach.start` (count), `forEach.item.start`, `forEach.item.end` and `forEach.item.error` (index), `forEach.end`. |
| E7 | **`core.parse-csv`:** a core capability. Input `{ file: FileRef, delimiter?, header? (default true) }`; returns `{ columns: string[], rows: object[] }` (with `header: false`, `rows` are string arrays). RFC 4180: quoted fields, escaped quotes, newlines inside quotes, CRLF, BOM. Read through the file service (`access: "bytes"`), size-capped like any read. |
| E8 | **Provider request limit:** the Adobe plugin config gains `maxRequestsPerMinute` (optional). The plugin's HTTP client spaces requests to stay under it, across steps and concurrent items in the host process. Other HTTP plugins can follow the same pattern. |

## Example: banner variants

```json
{ "type": "forEach", "id": "variants", "items": { "$ref": "state.variantRows" }, "as": "variant",
  "concurrency": 2, "throttle": { "starts": 4, "perSeconds": 60 }, "onError": "continue",
  "steps": [ upload background, composite (background + texts), reflow (UXP), inspect, check, select artboards, render, name renditions ],
  "collect": { "$ref": "state.renditions" }, "into": "variantRenditions" }
```

3 rows × 4 sizes → 12 renditions in `state.variantRenditions`.

## Gap (rough order)

1. `core.parse-csv` (E7).
2. `forEach` (E1–E6): protocol and schema, validation (L1–L3, scoping, `collect`/`into` typing), executor
   (scopes, concurrency, throttle, errors, records, resume, events), App graph node, specs 02/04/05/11.
3. Adobe `maxRequestsPerMinute` (E8).
4. `examples/psd-variants`: CSV + backgrounds → 12 renditions.
