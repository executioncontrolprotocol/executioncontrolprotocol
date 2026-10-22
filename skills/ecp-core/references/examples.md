# Core examples index

Today each example is a `workflow.ts` plus an `environment.ts`. Phase 4 converts the surviving
ones into single `*.ecp.ts` workflow files.

| Folder | Teaches | Reset |
| --- | --- | --- |
| `01-echo` | Minimal Fluent, test extension, CLI | Kept |
| `02-weekly-brief` | Multi-step, `ref()`, a model step | Kept; `memory` replaced by workflow input in Phase 1 |
| `03-secrets-bind` | Keychain and `secrets()` in extension config | Kept |
| `04-encode-decode` | TOON round-trip | **Removed in Phase 1** (format plugins cover it) |
| `05-test-session` | `ecp test start` / `run --to` / `rerun` / `status` | **Removed in Phase 1**; Phase 4 adds `ecp run --to` / `runs resume` / `runs rerun`. Core `test-session` and `ecp test` remain until then |
| `06-invoke` | `ecp invoke` outside a workflow | Kept |
| `07-accepts-returns` | `.accepts()` / `.returns()`, `ecp run --input` | Kept |
| `vendor/*` | Vendor extension examples | Move next to their plugins in Phase 5 (Slack example removed in Phase 1) |

See `examples/README.md` and `RESET-PLAN.md` §5.5.
