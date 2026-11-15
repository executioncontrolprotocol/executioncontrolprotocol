# Examples (realignment)

`examples/*` are legacy single-file `*.ecp.ts` workflows (v1); Phase 0 moves them to `legacy/examples/`. In Phase 0 they're converted to
v2 execution manifests (`*.ecp.json`) and become conformance fixtures: each must produce the
expected state outcome on the new engine (written by hand; legacy code is not run after Phase 0).

| Folder | Teaches | Phase 0 fixture covers |
| --- | --- | --- |
| `01-echo` | Minimal step | Smallest valid execution |
| `02-weekly-brief` | Multi-step, refs, a model step | Sequence, `$ref`, `config` on a step |
| `03-secrets-bind` | Secrets in extension config | Config object with `$secret` (no secrets in the execution) |
| `06-invoke` | Calling one capability | One-step `execute` |
| `07-accepts-returns` | `accepts` / `returns`, run input | Execution `accepts`/`returns` |
| `08-branch-loop` | Branch, gated step, loop | `branch` with default arm, `expr` on a step, `loop` with `maxRounds` |
| `dogfood/` | Agent-repair tasks: JSONata reshape, resize + upload, caption; each with an injected failure | Error codes (`ECP_STEP_FAILED`, `ECP_REF_UNRESOLVED`, `ECP_PLUGINS_MISSING`) and repair loops; see `examples/dogfood/README.md` |
| `plugins/plugin-*/examples` | Plugin-specific workflows | Firefly dogfood workflows become fixtures for `$script` and HTTP capabilities |

The plan's "Full example" (`localize-banner`) is the reference for a v2 execution using every
feature.
