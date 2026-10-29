# 03 — Secrets bind

Store an API key in the OS keychain, then bind it from `config.ecp.ts` — never from the workflow file.

## Setup

```bash
ecp config secrets add openai/api-key
# paste the key when prompted
```

## Files

- `workflow.ecp.ts` — echo step (`plugin-test`). Do not bind `secrets` here.

Put `extension("@executioncontrolprotocol/openai").with({ apiKey: secrets("openai/api-key") })` on `config.ecp.ts` (`ecp config edit`), not on the workflow.

## Run

```bash
ecp plugins link plugins/plugin-test
ecp workflows validate examples/03-secrets-bind/workflow.ecp.ts
ecp run examples/03-secrets-bind/workflow.ecp.ts
```

See also: docs [Security](https://executioncontrolprotocol.io/learn/security).
