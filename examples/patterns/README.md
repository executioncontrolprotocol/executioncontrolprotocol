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
| `if-in-loop.ecp.json` | `forEach` over orders, `if` Express?, merge port on Pick fast / Pick standard, Ship, then Notify reading `Label[]` after the loop. |
| `loop-for.ecp.json` | A `for` loop driven by `input.count` (`state.count`), with the index `i`; body keys leave the loop as arrays. |
| `loop-foreach.ecp.json` | A `forEach` loop over `input.items` (`concurrency: 2`); body `as` keys are arrays after the loop. |
| `nested-foreach-branch.ecp.json` | `forEach` → `if` → (`parallel` in `then`, `for` in `else`); read body keys as arrays after the loop. |
| `nested-parallel.ecp.json` | `parallel` → path 1 holds an `if` → `for`; path 2 holds a `forEach` → `parallel`. Three containers deep on both paths. |
