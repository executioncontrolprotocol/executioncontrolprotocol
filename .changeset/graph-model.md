---
"@executioncontrolprotocol/protocol": minor
"@executioncontrolprotocol/quickjs": minor
"@executioncontrolprotocol/engine": minor
"@executioncontrolprotocol/app": minor
---

Graph model: nodes and branches. Manifest v2 is revised in place (no migration). `branch` becomes an `if` node
(`accepts`, `input`, `expression` or `script` over `input`, optional scoped `as`, `then`, `else`); any condition
failure takes `else`. `parallel.branches` becomes `parallel.paths` with optional pass-through `accepts` / `input` /
`as`. Loops take their driver from `input.items` / `input.count` and close with an `end` node that gathers each
round's result (`input.value` or an `expression` / `script`) and, for `while`, reads `repeat` after each round.
The step `expr` gate, loop `ref` / `expr` / `collect`, the `(state) => …` expression form, `branch.select`,
the cursor's `branches` and `ECP_LOOP_UNTYPED` are removed; `if.select`, `loop.repeat` and `cursor.choices` are
added. The App draws `if` / `parallel` / `loop` / `end` nodes in containers and draws a branch only for a `$ref`;
route lines, pills and arm menus are gone. Every spec, example and fixture is converted.
