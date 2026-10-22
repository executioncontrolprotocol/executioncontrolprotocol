# ECP examples

Runnable `workflow.ts` + `environment.ts` pairs for consumer fluency. Prefer these over inventing APIs.

Install the CLI: `npm install -g @executioncontrolprotocol/cli` (or build/link from this monorepo).

| Folder | Teaches |
| ------ | ------- |
| [01-echo](./01-echo) | Minimal Fluent + test extension + format-toon + CLI |
| [02-weekly-brief](./02-weekly-brief) | Multi-step + `ref()` + OpenAI; signals are workflow input |
| [03-secrets-bind](./03-secrets-bind) | `ecp config secrets` + `secrets()` in extension config |
| [06-invoke](./06-invoke) | `ecp invoke` outside a workflow |
| [07-accepts-returns](./07-accepts-returns) | `.accepts()` / `.returns()` + `ecp run --input` |

Vendor examples live under `examples/vendor/` (fal, image-sharp, Adobe). The Slack example was removed in Phase 1.

`ecp test` still works against any remaining example; the dedicated `05-test-session` folder was removed in Phase 1.
