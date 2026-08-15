# 02 — Weekly brief

Multi-step workflow with `ref()` and memory + OpenAI.

Store a key first:

```bash
ecp config secrets add openai/api-key
```

```bash
ecp run examples/02-weekly-brief/workflow.ts --env examples/02-weekly-brief/environment.ts
```

The environment binds `apiKey: secrets("openai/api-key", { optional: true })`.
