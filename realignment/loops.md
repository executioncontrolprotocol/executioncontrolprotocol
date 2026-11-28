# Loops and the marker rule

**Superseded:** loop shape, tunnels, drivers, and what leaves a loop are defined in
[`graph-model.md`](graph-model.md) and [`spec/02-execution-manifest.md`](spec/02-execution-manifest.md) /
[`spec/04-executor.md`](spec/04-executor.md). This file keeps the marker rule (R1, R2) for historical
context only.

**Status:** design agreed 2026-11-22; the tunnels model (2026-11-26) retired `while`, stored loop
`end`, and `into` in favour of `for` / `forEach` and array outputs after the loop.

## Marker rule (still in spec 02)

| Rule | Meaning |
| --- | --- |
| R1 | **`$` marks a substitution in a value position** (`input`, `$script.params`, config `values`): `$ref`, `$state`, `$script` (and `$secret` / `$env` in config only). **Node fields are plain** — no `$` — including `uses`, `as`, step `mode`, loop `mode`, `if` `expression` / `script`, and a transform step's `script` object. |
| R2 | **Data reaches a node only through `$ref`, `$state`, or literals.** Computed outputs come from steps; values after a loop are arrays on body keys. `$script` in `input` is code passed as data, not a host transform. |

For loop execution and App behaviour, see [`graph-model.md`](graph-model.md).
