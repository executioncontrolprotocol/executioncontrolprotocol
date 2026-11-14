# ECP realignment — phase docs

Working docs for the `milestone/realignment` milestone. [`REALIGNMENT-PLAN.md`](../REALIGNMENT-PLAN.md)
at the repo root holds the decisions and the target architecture. Each phase gets a doc here
with scope, tasks, tests and exit criteria **before** work on it starts.

The previous milestone's plan (the CLI reset) is retired. What still applies is in the plan's
"Carried over from the CLI reset" section.

| Phase | Doc | Status | Depends on |
| --- | --- | --- | --- |
| — | [Docs and rules index](doc-index.md) | Done 2026-11-14 | — |
| 0 | [Build spec](phase-0-build-spec.md) | Not started | — |
| 1 | Milestone setup | Not planned | 0 |
| 2 | Core: service container, manifest v2, executor, expressions | Not planned | 0, 1 |
| 3 | Plugins: authoring API, manifests, in-process loading | Not planned | 2 |
| 4 | ECP host: HTTP API, storage, secrets, formatters, runs | Not planned | 2, 3 |
| 5 | Supervisor, MCP relay, CLI (after the CLI benchmark) | Not planned | 4 |
| 6 | App on the host API | Not planned | 4 |
| 7 | Fluent SDK (and formatter, if adopted) | Not planned | 2 |
| 8 | First plugins and the end-to-end dev loop | Not planned | 3, 4, 5 |

Phase numbers follow "Phases" in the plan. A phase is "Not planned" until its doc exists.

## How every phase works

- **No implementation code before Phase 0 is done.** Phase 0 turns the plan into exact
  schemas, signatures and behaviour rules in `realignment/spec/`. Spikes and benchmarks in
  Phase 0 are throwaway and live in `realignment/spikes/`.
- **Plan from the spec, not from memory.** Each phase doc is written from the finished spec and
  the plan, and lists file-level tasks, tests (positive, negative, edge) and exit criteria.
- **Branches:** `feat/realignment-<phase>-<slug>` from `milestone/realignment`; PRs into
  `milestone/realignment`. Never push to `main` (publishes to npm) or `development`.
- **Legacy packages are reference code.** Read them for what to carry over (plan: "What carries
  over"); don't extend them. Delete a legacy package in the PR that replaces it.
- **If the plan or a phase doc is wrong,** stop and say so in the PR rather than improvising.
  Fix the doc in the same PR once agreed.
- **Done means:** every exit criterion checked off with evidence in the PR, CI green, and the
  status updated in this table.
