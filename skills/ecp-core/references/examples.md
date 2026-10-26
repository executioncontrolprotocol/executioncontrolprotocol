# Core examples index

Each kept example is a single `*.ecp.ts` workflow file (Phase 4 PR 1). `--env` is optional.

| Folder | Teaches | Reset |
| --- | --- | --- |
| `01-echo` | Minimal Fluent + `plugin-test` (`test.echo`) | Single `workflow.ecp.ts`; `.with([extension("@executioncontrolprotocol/test")])` |
| `02-weekly-brief` | Multi-step, `ref()`, a model step | Single `workflow.ecp.ts`; `memory` replaced by workflow input in Phase 1 |
| `03-secrets-bind` | Keychain and `secrets()` in extension config | Single `workflow.ecp.ts`; does not bind `secrets` in the workflow |
| `04-encode-decode` | TOON round-trip | **Removed in Phase 1** (format plugins cover it) |
| `05-test-session` | `ecp test start` / `run --to` / `rerun` / `status` | **Removed in Phase 1**; use `ecp run --to` / `runs resume` / `runs rerun` |
| `06-invoke` | `ecp invoke` outside a workflow | Single `workflow.ecp.ts` |
| `07-accepts-returns` | `.accepts()` / `.returns()`, `ecp run --input` | Single `workflow.ecp.ts` |
| `plugins/plugin-*/examples` | Plugin `*.ecp.ts` examples | Moved in Phase 5 (Slack example removed in Phase 1) |
| `reset/dogfood/` | Phase 6 Dogfood A fixtures + local proofs | Not converted examples; see `reset/dogfood/README.md` |
| `08-ollama-*` | Retired stubs | **Deleted in Phase 4 PR 1** (they were empty READMEs, not converted) |

See `examples/README.md` and `RESET-PLAN.md` §5.5.
