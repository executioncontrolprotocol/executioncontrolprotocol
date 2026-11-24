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
| `branch.ecp.json` | A `branch` with two conditional arms and a default arm, between two steps. |
| `parallel.ecp.json` | A `parallel` with three lines, then a step that reads one line's output after the join. |
| `loop-while.ecp.json` | A `while` loop with an `expr` gate and `maxRounds`; the step after reads the body output as optional. |
| `loop-for.ecp.json` | A `for` loop driven by `ref` (`state.count`), with the iteration variable `i`. |
| `loop-foreach.ecp.json` | A `forEach` loop over a list (`concurrency: 2`), collected into `greetings`. |
| `nested-foreach-branch.ecp.json` | `forEach` → `branch` → (`parallel` in one arm, `while` in the other), then a step inside the loop that is collected. Three containers deep. |
| `nested-parallel.ecp.json` | `parallel` → one line holds `branch` → `for`; the other holds `forEach` → `parallel`. Three containers deep on both lines. |
