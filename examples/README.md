# ECP examples

Runnable `workflow.ts` + `environment.ts` pairs for consumer fluency. Prefer these over inventing APIs.

Install the CLI: `npm install -g @executioncontrolprotocol/cli` (or build/link from this monorepo).

| Folder | Teaches |
| ------ | ------- |
| [01-echo](./01-echo) | Minimal Fluent + test extension + format-toon + CLI |
| [02-weekly-brief](./02-weekly-brief) | Multi-step + `ref()` + memory / OpenAI |
| [03-secrets-bind](./03-secrets-bind) | `ecp config secrets` + `secrets()` in extension config |
| [04-encode-decode](./04-encode-decode) | TOON encode / decode round-trip |
| [05-test-session](./05-test-session) | `ecp test start` / `run --to` / `rerun` / `status` |
| [06-invoke](./06-invoke) | `ecp invoke` outside a workflow |

Vendor examples (fal, Slack, Adobe, …): https://github.com/executioncontrolprotocol/extensions/tree/main/examples

## Retired stubs

These folders are **not** current Fluent v1 samples — see their READMEs:

- `04-compile-and-run` (docs-only; use `ecp compile` + `01-echo`)
- `controller-specialist`
- `create-then-summarize-ollama`
- `harness-ollama`
- `ollama-mcp-tools`
- `ollama-filesystem-documents`
