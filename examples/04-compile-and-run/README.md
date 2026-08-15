# Retired — use current examples

This folder is a **legacy / docs-only stub**, not a Fluent v1 runnable sample.

Use instead:

- [examples/README.md](../README.md) — current skill map
- [01-echo](../01-echo) — minimal end-to-end
- [04-encode-decode](../04-encode-decode) — compile / encode / decode

```bash
ecp compile examples/01-echo/workflow.ts -o /tmp/workflow.json
ecp run examples/01-echo/workflow.ts --env examples/01-echo/environment.ts
```
