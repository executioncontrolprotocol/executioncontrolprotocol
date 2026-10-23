# ECP examples

Single-file `*.ecp.ts` workflows. Prefer these over inventing APIs.

Install the CLI: `npm install -g @executioncontrolprotocol/cli` (or build/link from this monorepo).

| Folder | Teaches |
| ------ | ------- |
| [01-echo](./01-echo) | Minimal Fluent + built-in `test.echo` |
| [02-weekly-brief](./02-weekly-brief) | `.with()` + `ref()` + OpenAI; signals are workflow input |
| [03-secrets-bind](./03-secrets-bind) | Secrets stay on the environment, not the workflow file |
| [06-invoke](./06-invoke) | `ecp invoke` outside a workflow |
| [07-accepts-returns](./07-accepts-returns) | `.accepts()` / `.returns()` + `ecp run --input` |

Plugin examples live next to each plugin under `plugins/plugin-*/examples/` (`*.ecp.ts`).

Offline examples (`01-echo`, `03-secrets-bind`, `06-invoke`, `07-accepts-returns`) run in CI. `02-weekly-brief` needs the OpenAI plugin and an API key; use `--dry-run` without a key.

Step a run with `ecp run <file> --to <step>`, then `ecp runs resume` / `ecp runs rerun`. Journals live under `.ecp/runs/`.
