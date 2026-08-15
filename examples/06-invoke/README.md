# 06 — Invoke

Call a capability outside a workflow run.

## CLI

```bash
ecp invoke @executioncontrolprotocol/test.echo \
  --env examples/06-invoke/environment.ts \
  --input examples/06-invoke/input.json
```

## HTTP (optional)

```bash
ecp serve --env examples/06-invoke/environment.ts
# POST http://127.0.0.1:3090/v1/invoke  (loopback, no auth)
```

For the Ollama browser demo bridge with pairing tokens, use `ecp up` instead.
