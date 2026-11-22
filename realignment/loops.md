# Loops: `while`, `for` and `forEach` in one node, and the marker rule

**Status:** design agreed 2026-11-22; supersedes the separate `forEach` node (first version of this doc, PRs #97–#103).
**Origin:** the banner-variants use case — one PSD template, a CSV of variants, a set of background files, several
artboard sizes: every row becomes a variant, every variant a set of renditions. Per-item work first shipped as its own
node type beside `loop`; one `loop` node with a `mode` keeps the manifest smaller and matches how authors think about
repetition (loop *while*, loop *n times*, loop *over items*).

## Principles

1. **One loop node.** Repetition is `type: "loop"`. `mode` says how it repeats: `while` (default), `for` or
   `forEach`. Modes differ in what drives them and how state is scoped, and validation names the mode in its errors.
2. **A loop is driven by exactly one of `ref` or `expr`.** `ref` is a state path: the value comes from the step that
   produced it, so the loop is **typed** (validation knows the item shape, the App draws the data edge). `expr` is a
   JavaScript function evaluated at run time, so the loop is **untyped** (validation warns in `forEach` mode). Which
   field is present tells a reader which one it is.
3. **`forEach` items run in their own scope.** An item's steps see the state as it was when the loop started, plus
   the item; what they write stays in the item's scope, so items can run concurrently and deterministically.
4. **`forEach` ends by collecting.** When every item has finished, one value per item (in item order) is committed to
   state as an array; the steps after the loop see only that.
5. **Concurrency is the loop's only pacing control.** A provider's request rate belongs to that provider's plugin
   config (the Adobe plugin's `maxRequestsPerMinute`), because only the plugin sees every request from every step and
   every run; an item-start throttle on the loop is a poor proxy (one item can make many requests) and is not offered.
6. **Data comes in as data.** A CSV file is parsed by a capability (`core.parse-csv`), not by hand in a transform.

## The marker rule (applies to the whole manifest)

| # | Rule |
| --- | --- |
| R1 | **Syntax: `$` marks a substitution in a value position.** Where a literal JSON value could legitimately sit (step `input`, `$script.params`, config `values`), anything resolved by the host is a `$` marker — `$ref`, `$state`, `$script` (and `$secret` / `$env` in config objects only) — so it can't be confused with literal data. Node fields have a fixed meaning and type (`uses`, `as`, `into`, `mode`, `expr`, the loop's `ref` / `collect`, a transform step's `script`), so they are plain: no `$`. |
| R2 | **Dataflow: data reaches a step only through `$ref`, `$state` or literals.** Anything computed comes from a node (a transform step, or a loop's `collect`). This is why input `$expr` was removed (#88) even though its syntax followed R1. `$script` passes code as data (it is never run by ECP); it is not a computation on the run's data. A loop's `expr` decides what runs (and in `forEach` mode, what the items are); it never writes state. |

Applying R1 changes one existing field: a transform step's `script` holds the script object directly —
`"script": { "lang": "js", "path": "scripts/x.js" }` instead of `"script": { "$script": { … } }`. `$script` stays the
marker for scripts passed in value positions (for example a Photoshop UXP script in `input`).

## Decisions

| # | Decision |
| --- | --- |
| L1 | **Loop node:** `{ "type": "loop", "id", "label"?, "mode"?: "while" \| "for" \| "forEach", "ref"?: "state.<path>", "expr"?: "<function>", "steps": [...], ... }`. Exactly one of `ref` and `expr` (neither or both → `ECP_MANIFEST_INVALID`). `ref` uses the `$ref` path syntax without the marker object; no `optional` / `fallback`. |
| L2 | **`while` (default):** `ref` (a boolean) or `expr` (returns a boolean) is checked **before each round**, including the first; `true` runs a round. `maxRounds` required (`1..1000`); reaching it ends the loop normally (`loop.exhausted`). Rounds share the run's state; `create` inside the body → `ECP_COMMIT_CONFLICT`. No `as`. |
| L3 | **`for`:** `ref` (an integer) or `expr` (returns an integer) is read **once**; the body runs that many times (`0..1000`; more → `ECP_LIMIT_EXCEEDED`; not a non-negative integer → `ECP_TYPE_MISMATCH`). `as` required: `state.<as>` is the iteration number (from 0) during the loop and is removed when the loop ends. Iterations share the run's state and run in order; `create` in the body → `ECP_COMMIT_CONFLICT`. |
| L4 | **`forEach`:** `ref` (an array) or `expr` (returns an array) is read **once** (`0..10000` items; more → `ECP_LIMIT_EXCEEDED`; not an array → `ECP_TYPE_MISMATCH`). `as` required: inside the body the item is `state.<as>` and its index `state.<as>Index`. Each item runs on a deep copy of the state at the loop's start; body writes stay in the copy (`create` is allowed). `collect` (a state path, resolved in the item's scope after the body) is the item's result; when all items have finished, `state.<into>` = the results in item order (`create` semantics). `concurrency` (`1..32`, default 1) items run at once. `onError`: `"fail"` (default) stops starting items, lets running ones finish, fails with the lowest-index error; `"continue"` records `null` and adds `{ index, error }` to `state.<into>Errors`. |
| L5 | **Field validity per mode:** `maxRounds` only in `while`; `as` in `for` and `forEach`; `collect`, `into`, `concurrency`, `onError` only in `forEach` (and `collect` / `into` required there). Anything else → `ECP_MANIFEST_INVALID` naming the mode. |
| L6 | **Typing:** with `ref`, L3 types the value from its producer: `while` needs a boolean, `for` an integer, `forEach` an array (element schema types `state.<as>`). With `expr`, `forEach` items are untyped (`{}`) and validation adds a warning (`ECP_LOOP_UNTYPED`) on the loop; `for` / `while` need no warning (the result's type is checked at run time). |
| L7 | **Records, resume and events:** `while` / `for` step records are keyed by round (`<nodeId>#<round>`); `forEach` step records by item (`<nodeId>#i<index>`). The outermost `forEach` loop keeps finished items in `runs/<id>/loop-items/<nodeId>.json`; resume skips them and restarts unfinished items from their first step. Events: `loop.round` (`while`, `for`), `loop.exhausted` (`while`), `loop.start` (`count`, `forEach`), `loop.item.start` / `loop.item.end` / `loop.item.error` (`index`), `loop.end` (`count`, `failed`). Step events inside a `forEach` carry `item` / `items`. |
| L8 | **App:** `while` / `for` loops draw a back-edge (the body repeats on shared state); `forEach` loops draw a frame around the body with the loop node at its head. A loop with `ref` gets a data edge from the producer; `collect` comes from the body step that writes it; later reads of `into` start at the loop node. |
| L9 | **`core.parse-csv`** and the Adobe plugin's **`maxRequestsPerMinute`** stay as shipped (#98, #99). |

## Example: banner variants

```json
{ "type": "loop", "mode": "forEach", "id": "build-variants", "ref": "state.prepared.rows", "as": "variant",
  "concurrency": 2, "onError": "fail",
  "steps": [ composite (background + texts), reflow (UXP), inspect, check, select artboards, render, summary ],
  "collect": "state.summary", "into": "variants" }
```

3 rows × 4 sizes → 12 renditions; the Adobe plugin's `maxRequestsPerMinute` keeps the requests within the key's quota.

## Gap

One PR: the marker rule (R1, R2) and the transform `script` field; the separate `forEach` node folded into `loop`
with modes (`for` added; `throttle` removed); validation, executor, storage, events, App; specs 02–06 and 11; skills;
examples (`psd-variants` and every transform step).
