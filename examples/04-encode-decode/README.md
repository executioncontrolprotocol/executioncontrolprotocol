# 04 — Encode / decode

Round-trip a workflow through TOON using the CLI (Fluent encode is also supported; Fluent decode is not — use `ecp compile`).

## Run

```bash
ecp compile examples/04-encode-decode/workflow.ts -o /tmp/echo.workflow.json

ecp encode /tmp/echo.workflow.json --format toon \
  --env examples/04-encode-decode/environment.ts \
  -o /tmp/echo.toon

ecp decode /tmp/echo.toon --format toon \
  --env examples/04-encode-decode/environment.ts \
  -o /tmp/echo.decoded.json

ecp encode /tmp/echo.workflow.json --format fluent \
  --env examples/04-encode-decode/environment.ts \
  -o /tmp/echo.generated.ts
```

Encode/decode/patch results use `.result` (not `.content` / `.document`).
