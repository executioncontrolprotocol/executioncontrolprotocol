# 07 — Accepts / returns

Workflow contract: `.accepts()` for run input, `.returns()` for public `result.output`. Same verbs on JSON `workflow.accepts` / `workflow.returns`.

Input is checked on `ecp run` (and `--dry-run`) **before** steps execute. `ecp validate` still checks the graph and environment only.

```bash
ecp run examples/07-accepts-returns/workflow.ts \
  --env examples/07-accepts-returns/environment.ts \
  --input examples/07-accepts-returns/input.json

# Validate input without invoking capabilities
ecp run examples/07-accepts-returns/workflow.ts \
  --env examples/07-accepts-returns/environment.ts \
  --input examples/07-accepts-returns/input.json \
  --dry-run
```

`ref("value")` reads the accepted input key. After a successful run, `result.output.echo` is the step stored as `echo`.
