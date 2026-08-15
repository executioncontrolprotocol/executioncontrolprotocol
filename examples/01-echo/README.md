# 01 — Echo

Minimal Fluent workflow + test extension + format-toon.

```bash
ecp run examples/01-echo/workflow.ts --env examples/01-echo/environment.ts
ecp validate examples/01-echo/workflow.ts --env examples/01-echo/environment.ts
ecp compile examples/01-echo/workflow.ts -o /tmp/echo.json
ecp describe --env examples/01-echo/environment.ts
ecp search "echo" --env examples/01-echo/environment.ts
```
