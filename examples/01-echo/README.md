# 01 — Echo

Minimal Fluent workflow. `test.echo` is built into the Node host; this file has no `.with()` and no environment module.

```bash
ecp run examples/01-echo/workflow.ecp.ts
ecp validate examples/01-echo/workflow.ecp.ts
ecp compile examples/01-echo/workflow.ecp.ts -o /tmp/echo.json
ecp describe
ecp search "echo"
```
