# ECP examples

Single-file `*.ecp.ts` workflows. Prefer these over inventing APIs.

Install the CLI: `npm install -g @executioncontrolprotocol/cli` (or build/link from this monorepo).

| Folder | Teaches |
| ------ | ------- |
| [01-echo](./01-echo) | Minimal Fluent + `plugin-test` (`test.echo`) |
| [02-weekly-brief](./02-weekly-brief) | `.with()` + `ref()` + OpenAI; signals are workflow input |
| [03-secrets-bind](./03-secrets-bind) | Secrets stay on the environment, not the workflow file |
| [06-invoke](./06-invoke) | `ecp environments invoke` outside a workflow |
| [07-accepts-returns](./07-accepts-returns) | `.accepts()` / `.returns()` + `ecp run --input` |

Plugin examples live next to each plugin under `plugins/plugin-*/examples/` (`*.ecp.ts`).

Echo examples need `@executioncontrolprotocol/plugin-test`. From a source checkout, `ecp plugins link plugins/plugin-test`. After the CLI is on `latest`, `ecp workflows install examples/01-echo/workflow.ecp.ts` installs the npm package. `02-weekly-brief` needs the OpenAI plugin and an API key; use `--dry-run` without a key. Offline CI runs bind `testExtension` on the test host.

Step a run with `ecp run <file> --to <step>`, then `ecp runs resume` / `ecp runs rerun`. Journals live under `.ecp/runs/`.
