# 02 — Weekly brief

Workflow file with `.with()` + `ref()` and OpenAI. Weekly signals are workflow input.

Store a key first:

```bash
ecp config secrets add openai/api-key
```

```bash
ecp run examples/02-weekly-brief/workflow.ecp.ts --input '{"signals":[]}'
ecp run examples/02-weekly-brief/workflow.ecp.ts --input '{"signals":[]}' --dry-run
```

The workflow binds `apiKey: secrets("openai/api-key", { optional: true })`. The OpenAI plugin must be installed (`ecp install examples/02-weekly-brief/workflow.ecp.ts`).
