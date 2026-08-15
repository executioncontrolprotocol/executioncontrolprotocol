# 03 — Secrets bind

Store an API key in the OS keychain, then bind it into extension config with `secrets("…")`.

## Setup

```bash
ecp config secrets add openai/api-key
# paste the key when prompted
```

## Files

- `environment.ts` — binds `@executioncontrolprotocol/secrets` + OpenAI via `secrets("openai/api-key")`
- `workflow.ts` — echo step (always runnable); swap in OpenAI when you want a live model call

## Run

```bash
ecp validate examples/03-secrets-bind/workflow.ts --env examples/03-secrets-bind/environment.ts
ecp run examples/03-secrets-bind/workflow.ts --env examples/03-secrets-bind/environment.ts
```

See also: docs [Security](https://executioncontrolprotocol.io/learn/security).
