# Examples (realignment)

`examples/*` are legacy single-file `*.ecp.ts` workflows (v1). In Phase 0 they're converted to
v2 execution manifests (`*.ecp.json`) and become conformance fixtures: each must produce the
same state outcome on the legacy executor (through a v1 adapter) and on the new one.

| Folder | Teaches | Phase 0 fixture covers |
| --- | --- | --- |
| `01-echo` | Minimal step | Smallest valid execution |
| `02-weekly-brief` | Multi-step, refs, a model step | Sequence, `$ref`, `config` on a step |
| `03-secrets-bind` | Secrets in extension config | Config object with `$secret` (no secrets in the execution) |
| `06-invoke` | Calling one capability | One-step `execute` |
| `07-accepts-returns` | `accepts` / `returns`, run input | Execution `accepts`/`returns` |
| `08-branch-loop` | Branch, gated step, loop | `branch` with default arm, `expr` on a step, `loop` with `maxRounds` |
| `plugins/plugin-*/examples` | Plugin-specific workflows | Firefly dogfood workflows become fixtures for `$script` and HTTP capabilities |

The plan's "Full example" (`localize-banner`) is the reference for a v2 execution using every
feature.
