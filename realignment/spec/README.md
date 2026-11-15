# ECP MVP build spec

The implementation spec for the realignment MVP. It turns `REALIGNMENT-PLAN.md` into exact
shapes, signatures, behaviour rules and tests. **Coding agents implement it as written.**

- **Status:** decided 2026-11-14. Changes go through a PR that edits the spec first (and says
  why), then the code. Never let code and spec disagree.
- **Precedence:** this spec > `REALIGNMENT-PLAN.md` > everything else. Where the plan is
  vaguer, the spec decides. Where they conflict, fix the plan in the same PR.
- **Scope:** the MVP only. The Fluent SDK is a separate post-MVP phase (`../post-mvp-fluent-sdk.md`)
  and is not referenced by any MVP phase.

| # | Document | Covers |
| --- | --- | --- |
| 01 | [Layout and stack](01-layout-and-stack.md) | Repo layout, packages, dependencies, toolchain, CI |
| 02 | [Execution manifest](02-execution-manifest.md) | The v2 JSON manifest: document, nodes, value markers |
| 03 | [Validation](03-validation.md) | Validation layers, the ref/type check, issues, generated schemas |
| 04 | [Executor](04-executor.md) | Run semantics, state, commit modes, expressions, scripts, failure, resume |
| 05 | [Objects and storage](05-objects-and-storage.md) | Config, run records, events, plugin manifest, `~/.ecp` layout |
| 06 | [Operations](06-operations.md) | `retrieve`, `execute`, `commit`: inputs, outputs, errors, exit codes |
| 07 | [Services](07-services.md) | Service container and every MVP service interface |
| 08 | [Plugins](08-plugins.md) | Plugin SDK, `ecp.manifest.json`, loading, handler context |
| 09 | [Host, supervisor, relay](09-host-supervisor-relay.md) | HTTP API, auth, `host.json`, restart protocol, MCP relay |
| 10 | [CLI](10-cli.md) | Every command, flag, output and host discovery |
| 11 | [App](11-app.md) | MVP App scope on the host API |
| 12 | [Testing and acceptance](12-testing-and-acceptance.md) | Test strategy, fixtures, benchmarks, MVP acceptance scenarios |

## Conventions used in the spec

- TypeScript signatures are normative for the public API of each package (names, parameters,
  return types). Internal structure is up to the implementer.
- JSON shapes are normative. Field order in examples is not.
- "Error `ECP_X`" means the operation returns an issue or error with that code, catalogued in
  06.
- "MUST" / "MUST NOT" are requirements; "should" is a strong default that needs a reason in the
  PR to deviate.
