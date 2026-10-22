# 02 — Weekly brief

Multi-step workflow with `ref()` and OpenAI. Weekly signals are workflow input, not a memory lookup.

Store a key first:

```bash
ecp config secrets add openai/api-key
```

```bash
ecp run examples/02-weekly-brief/workflow.ts --env examples/02-weekly-brief/environment.ts --input '{"signals":[]}'
```

The environment binds `apiKey: secrets("openai/api-key", { optional: true })`.
