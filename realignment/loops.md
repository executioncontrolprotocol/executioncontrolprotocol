# Loops: `while`, `for` and `forEach` in one node, and the marker rule

**Superseded for loop shape and execution:** [`graph-model.md`](graph-model.md) and specs
[`02`](spec/02-execution-manifest.md) / [`04`](spec/04-executor.md) are the contracts. This file
keeps the marker rule (R1, R2) and product context; loop drivers, gathering and `while` timing live
in the graph model.

**Status:** design agreed 2026-11-22; one `loop` node with `mode` replaced a separate `forEach`
node (PRs #97–#103); the graph model (PR #110) replaced `ref` / `expr` / string `collect` with
`input`, the `end` node and post-round `repeat` for `while`.
**Origin:** the banner-variants use case — one PSD template, a CSV of variants, backgrounds and
artboard sizes: every row becomes a variant, every variant a set of renditions.

## Principles

1. **One loop node.** Repetition is `type: "loop"`. `mode` is `while` (default), `for` or
   `forEach`. Modes differ in what drives them and how state is scoped; validation names the mode
   in its errors.
2. **The loop start node binds its driver with `input`.** `forEach` takes `input.items` (array);
   `for` takes `input.count` (integer); `while` has no driver ports on the start node. Values come
   from `$ref` branches into those ports (typed when the producer is known).
3. **`forEach` items run in their own scope.** An item's steps see the state as it was when the
   loop started, plus the item; body writes stay in the item scope, so items can run concurrently.
4. **`forEach` ends at the `end` node.** Each item or round contributes through `end.input`; an
   optional `expression` or `script` on `end` gathers the round result (default: `input.value`).
   Gathered values commit to `into` when the loop finishes (`forEach`: an array in item order).
5. **Concurrency is the loop's only pacing control.** Provider rate limits belong in plugin config
   (for example the Adobe plugin's `maxRequestsPerMinute`), not on the loop node.
6. **Data comes in as data.** A CSV file is parsed by a capability (`core.parse-csv`), not by hand
   in a transform.

## The marker rule (applies to the whole manifest)

| # | Rule |
| --- | --- |
| R1 | **Syntax: `$` marks a substitution in a value position.** Where a literal JSON value could sit (step `input`, `$script.params`, config `values`), anything resolved by the host is a `$` marker — `$ref`, `$state`, `$script` (and `$secret` / `$env` in config only). Node fields are plain: `uses`, `as`, `into`, `mode`, `if` / `end` `expression`, a transform step's `script`, loop `input`, and so on. |
| R2 | **Dataflow: data reaches a step only through `$ref`, `$state` or literals.** Computed values come from transform steps, `if` nodes, or the loop `end` gather. Input `$expr` is rejected. `$script` passes code as data (never run by ECP). Loop drivers are not expressions on the loop node; `while` repeats from `end.input.repeat` after each round. |

A transform step's `script` is a plain object — `"script": { "lang": "js", "path": "…" }` — not
`{ "$script": … }`. `$script` remains the marker in value positions (for example a UXP script in
`input`).

## Loop modes (summary)

Full field lists and port semantics: [`graph-model.md`](graph-model.md) and spec 02.

| Mode | Driver | Body | Result |
| --- | --- | --- | --- |
| `while` | No start `input`; body runs at least once | Shared run state; `create` in the body → `ECP_COMMIT_CONFLICT` | `end` gathers each round; `repeat` on `end.input` (`true` = another round); `maxRounds` caps rounds |
| `for` | `input.count` (integer) | `as` names the index; shared state; `create` in the body → `ECP_COMMIT_CONFLICT` | Last gathered value; optional `into` |
| `forEach` | `input.items` (array) | `as` names the item; isolated copy per item; `create` allowed | Array of gathered values at `into`; `concurrency`, `onError` on the loop |

`while` checks **after** each round by reading `repeat` from inside the body (wired into
`end.input`), not before the first round.

## Example: banner variants

```json
{
  "type": "loop",
  "mode": "forEach",
  "id": "build-variants",
  "input": { "items": { "$ref": "state.prepared.rows" } },
  "as": "variant",
  "concurrency": 2,
  "onError": "fail",
  "steps": [ "… composite, reflow, inspect, check, render, summary …" ],
  "end": { "input": { "value": { "$ref": "state.summary" } } },
  "into": "variants"
}
```

See `examples/psd-variants/psd-variants.ecp.json` for the full execution.

## Gap

Marker rule (R1, R2) and transform `script` shape ship in the graph-model PRs. Loop modes, validation,
executor, storage, events and the App follow `graph-model.md` and specs 02 / 04 / 11.
