---
"@executioncontrolprotocol/protocol": minor
"@executioncontrolprotocol/quickjs": minor
"@executioncontrolprotocol/engine": minor
"@executioncontrolprotocol/app": minor
---

Tunnels graph model (manifest v2 revised in place; no migration).

**Manifest and engine:** `if`, `loop` (`for` | `forEach`), and `parallel` control nodes; branches are
`$ref` (or `$ref` lists for merge ports after `if`). Values leaving a loop are arrays (`T[]`) keyed by
body `as` names. Retired: `while`, stored loop `end`, `into`, `maxRounds`, `loop.repeat`,
`loop.exhausted`, `branch` nodes, step `expr`, and old parallel `branches` / loop gather shapes.

**App:** grey rail and coloured tunnels (SVG overlay); one end marker per `if` side, `parallel` path,
and loop (drawn, not stored; drag to change scope); `ecp-tunnel` membership frames are invisible;
one Core-group control node with a Kind option (`if` · for each · for · parallel); multi-cardinal
inputs on `if` / `parallel` / transforms; merge ports via `$ref` lists; branches routed through
tunnels on lanes; tree layout left-to-right. A control node may be saved with an empty `then`, path
or loop body (validation reports it and `execute` refuses it until nodes are added).
