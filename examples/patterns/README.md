# Control-flow patterns

Small executions that show each structure on its own and nested inside each other. They only use
`@executioncontrolprotocol/test.echo`, so they run with `plugin-test` and nothing else. Open any of them in the
App to see how containers look:

```sh
ecp plugins link plugins/plugin-test
ecp app examples/patterns/nested-foreach-branch.ecp.json
ecp execute examples/patterns/nested-foreach-branch.ecp.json --input '{}'
```

Pass `--input '{}'` (or your own values) so the `accepts` defaults apply.

| File | Shows |
| --- | --- |
| `branch.ecp.json` | An `if` (`Gold tier?`) whose `else` holds another `if` (`Silver tier?`), between two steps. Each condition reads `input.tier`, bound from the `tier` input. |
| `parallel.ecp.json` | A `parallel` with three paths, then a step that reads one path's output after them. |
| `loop-while.ecp.json` | A `while` loop: the body runs, then the `end` node reads `repeat` from a node in the body; `maxRounds` caps it. `into` keeps the last round's value. |
| `loop-for.ecp.json` | A `for` loop driven by `input.count` (`state.count`), with the index `i`. |
| `loop-foreach.ecp.json` | A `forEach` loop over `input.items` (`concurrency: 2`); its `end` gathers each item's result into `greetings`. |
| `nested-foreach-branch.ecp.json` | `forEach` → `if` → (`parallel` in `then`, `while` in `else`), then a step inside the loop whose result `end` gathers. Three containers deep. |
| `nested-parallel.ecp.json` | `parallel` → path 1 holds an `if` → `for`; path 2 holds a `forEach` → `parallel`. Three containers deep on both paths. |
