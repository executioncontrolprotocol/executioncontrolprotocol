# 01 — Echo

Minimal Fluent workflow. `test.echo` lives in `@executioncontrolprotocol/plugin-test`, not the Node host.

```bash
ecp plugins link plugins/plugin-test
ecp run examples/01-echo/workflow.ecp.ts
ecp validate examples/01-echo/workflow.ecp.ts
ecp compile examples/01-echo/workflow.ecp.ts -o /tmp/echo.json
ecp describe
ecp search "echo"
```

Until 0.50.0 is on npm, link the workspace plugin. After publish, `ecp install examples/01-echo/workflow.ecp.ts` installs `@executioncontrolprotocol/plugin-test`.
