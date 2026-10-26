# 06 — Invoke

Call a capability outside a workflow run. `test.echo` requires `@executioncontrolprotocol/plugin-test`.

```bash
ecp plugins link plugins/plugin-test
ecp invoke @executioncontrolprotocol/test.echo \
  --input examples/06-invoke/input.json
```
