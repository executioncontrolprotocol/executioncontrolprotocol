# ECP realignment — MVP phases

MVP realignment merged into `development` via PR #68 on 2026-11-15. This tree is the MVP build
record plus audit follow-ups.

- **[`spec/`](spec/README.md)** — the MVP build spec: exact contracts. Implement it as written.
- **[`../REALIGNMENT-PLAN.md`](../REALIGNMENT-PLAN.md)** — decisions, architecture, rationale.
- **Phase docs below** — ordered tasks, tests and exit criteria per phase (historical).

The previous milestone's plan (the CLI reset) is retired. What still applies is in the plan's
"Carried over from the CLI reset" section.

## MVP phases

| Phase | Doc | Status | Depends on |
| --- | --- | --- | --- |
| — | [Docs and rules index](doc-index.md) | Done 2026-11-14 | — |
| — | [MVP build spec](spec/README.md) | Decided 2026-11-14 | — |
| 0 | [Groundwork](phase-0-groundwork.md) | Done 2026-11-15 (CI green on development / PR #68) | — |
| 1 | [Engine](phase-1-engine.md) | Done 2026-11-14 | 0 |
| 2 | [Plugins: SDK, manifests, loading](phase-2-plugins.md) | Done 2026-11-14 | 1 |
| 3 | [Local services and in-process host](phase-3-local-host.md) | Done 2026-11-14 | 1, 2 |
| 4 | [Host server and supervisor](phase-4-host-server.md) | Done 2026-11-15 | 3 |
| 5 | [CLI and the background-host decision](phase-5-cli.md) | Done 2026-11-15 | 3, 4 |
| 6 | [MCP relay](phase-6-mcp-relay.md) | Done 2026-11-15 | 4, 5 |
| 7 | [App](phase-7-app.md) | Done 2026-11-15 | 4 (5 for `ecp app`) |
| 8 | [First-party plugins and dogfood](phase-8-plugins-and-dogfood.md) | Done 2026-11-15 (A10 live green) | 2 (3 for end-to-end) |
| 9 | [MVP acceptance and cleanup](phase-9-acceptance.md) | Done 2026-11-15 | 0–8 |

Critical path: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 9. Phases 7 and 8 can run in parallel with 5–6
once their dependencies land.

**The MVP is done** when acceptance scenarios A1–A12 (`spec/12-testing-and-acceptance.md`)
pass in CI on Ubuntu and Windows.

## After the MVP: audit fixes

| Doc | Status |
| --- | --- |
| [MVP audit fixes (2026-11-15)](mvp-audit-fixes.md) | Done (A–G): all 22 findings fixed and merged ([#69](https://github.com/executioncontrolprotocol/executioncontrolprotocol/pull/69)–[#78](https://github.com/executioncontrolprotocol/executioncontrolprotocol/pull/78)) |
| [Validation at scale plan (F7)](schema-scaling-plan.md) | S1–S6 done (F7); [section 8](schema-scaling-plan.md) is the outcome record |

## Post-MVP

| Phase | Doc | Status |
| --- | --- | --- |
| F | [Fluent SDK](post-mvp-fluent-sdk.md) | Not planned (starts after Phase 9) |

No MVP phase depends on it, and MVP work must not add Fluent parsing or Fluent-specific APIs.

## How every phase works

- **Build from the spec.** Each phase doc says which spec sections it implements. If a contract
  has to change, change the spec first, in the same PR, and say why.
- **Branches:** `fix/*` or `feat/*` from `development`; PRs into `development`. Large changes
  split into several PRs, each green on its own. Never push to `main` (publishes to npm).
- **Tests with every change:** positive, negative and edge cases; coverage floors (90 % lines,
  functions, statements; 85 % branches) never lowered.
- **If the spec or a phase doc is wrong,** stop and say so in the PR rather than improvising.
- **Done means:** every exit criterion checked off with evidence in the PR (test names, CI
  links, numbers), CI green, and the status updated in this table.
