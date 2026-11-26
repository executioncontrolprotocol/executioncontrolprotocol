# AGENTS.md

## Read this first: post-merge MVP

MVP realignment merged into `development` via PR #68 on 2026-11-15. Spec and plan remain the
source of truth; new work branches from `development`.

1. **[`realignment/spec/`](realignment/spec/README.md)** is the MVP build spec: exact contracts. It wins
   over everything else.
2. **[`REALIGNMENT-PLAN.md`](REALIGNMENT-PLAN.md)** holds the decisions, architecture and rationale.
3. **[`realignment/`](realignment/README.md)** holds the phase docs (history of the MVP build) and
   audit follow-ups. For audit fixes see [`mvp-audit-fixes.md`](realignment/mvp-audit-fixes.md).
4. **This file and `.cursor/rules/`** hold the rules for working in the repo. Where anything
   here disagrees with the plan or a phase doc, the plan wins: say so in your PR and propose a
   fix to this file.

The previous milestone's plan (the CLI reset, `RESET-PLAN.md` and `reset/`) was retired on
2026-11-14. What still applies is in the plan's "Carried over from the CLI reset" section; the
originals are in git history (`git show 27238c96:RESET-PLAN.md`). Don't resurrect them as
instructions.

Ground rules:

- **Build from the spec.** `realignment/spec/` fixes every MVP contract; implement it as written.
  To change a contract, change the spec first in the same PR and say why. Throwaway spikes and
  benchmarks go in `realignment/spikes/`. Phase docs are historical; for audit/post-MVP work
  follow [`mvp-audit-fixes.md`](realignment/mvp-audit-fixes.md) or the relevant post-MVP doc.
- Branch `fix/*` or `feat/*` from `development`; open PRs into `development`. Audit fix groups
  are listed in [`realignment/mvp-audit-fixes.md`](realignment/mvp-audit-fixes.md).
- **Never push to `main`.** Pushes to `main` publish to npm.
- **MVP packages live under `packages/` and `plugins/`.** Implement against `realignment/spec/`.
  Do not resurrect deleted `legacy/` trees.
- Keep the pre-commit hook on. Don't skip, delete or weaken valid tests to get CI green, except
  for removals a phase doc explicitly lists.
- If the plan or a phase doc is wrong or impossible, stop and say so rather than improvising.
  Label anything stubbed, mocked or deferred honestly, in code and in the PR.

## What ECP is

An **ECP host** runs **executions**: JSON manifests of capability steps and graph nodes (`if`,
`parallel`, `loop` with `mode` `for` or `forEach`). The host validates every capability call against the
capability's `accepts`/`returns` schemas. Plugins only provide capabilities; they're loaded into
the host process on first call, from per-plugin manifests. Agents use exactly three
operations, `retrieve`, `execute`, `commit`, through an MCP relay, the CLI, or the host's
localhost HTTP API. Every key host component is a swappable **service**
(`environment.use(Impl, Interface.service)`). Policies are out of scope for now.

Full picture, vocabulary and diagrams: `REALIGNMENT-PLAN.md`. Architecture summary:
`ARCHITECTURE.md`.

## Principles

- **Delegation, not orchestration.** ECP serves the agent that operates it; don't build
  features that try to think for the agent.
- **Model-legible everywhere.** `--json` on every command, stable `ECP_*` codes with paths and
  suggestions, structured run records, help and metadata written for a model reader.
- **The self-healing loop is the product.** Every failure legible, every fix cheap to retry.
- **Engine does no I/O.** Everything external goes through services.
- **Be honest about stubs.** Label anything mocked or unimplemented; never ship it as real.
- **Hosted never diverges.** Hosted ECP adds service implementations and plugins, never
  execution semantics.

## Repository map (MVP)

| Path | Role |
| --- | --- |
| `packages/protocol` | Types, JSON schemas, service tokens, error catalogue |
| `packages/engine` | Executor, validation, operations, service container |
| `packages/quickjs` | QuickJS-WASM `ExpressionEngine` |
| `packages/local` | Disk storage, OS secrets, in-process plugin registration |
| `packages/formatters` | JSON and TOON formatters |
| `packages/host` | Local host, HTTP API, supervisor |
| `packages/cli` | `ecp` CLI |
| `packages/mcp-relay` | Stdio MCP relay (three tools) |
| `packages/app` | Visual App (`/app/`) |
| `packages/plugin-sdk` | `definePlugin` / `capability` |
| `plugins/plugin-test` | Harness capabilities (reference plugin) |
| `plugins/plugin-anthropic`, `plugin-azure-blob-storage`, `plugin-adobe-firefly-services` | MVP provider plugins |
| `fixtures/`, `examples/`, `test/e2e/`, `bench/` | Fixtures, examples, e2e/acceptance, budgets |
| `skills/ecp-core/` | Contributor skill |
| `REALIGNMENT-PLAN.md`, `realignment/`, `realignment/spec/` | Plan, phases, MVP build spec |

The Fluent SDK is a post-MVP phase (`realignment/post-mvp-fluent-sdk.md`).

## Rules that hold throughout

- **No `file:` package links.** Never put `"file:..."` in any dependency field. In-repo
  packages use `workspace:*` / `workspace:^`. Gate: `pnpm run check:no-file-deps`.
- **Secrets:**
  - Never commit live keys; use `.env` (gitignored), the OS keychain, or CI secrets.
  - Executions never contain secrets or `$secret`/`$env` references. Config objects hold
    `{ "$secret": "key" }` references; values live in the secrets provider and are set outside
    MCP (`ecp config secrets set`).
  - Pre-commit runs Secretlint; CI also runs Gitleaks.
- **Plugins never import hosts.** Plugin packages depend on the plugin authoring package (as a
  peer dependency) and focused third-party libraries, never on the host, CLI, relay or App
  packages. Heavy SDKs stay in their own plugin package.
- **Vendor-neutral host:** the host, CLI, relay and App must not branch on specific capability
  ids or output shapes. Domain knowledge lives in the plugin, surfaced through metadata and
  schemas.
- **JS in executions:** host-evaluated JavaScript (`expression` / `script` on `if`, transform steps,
  and similar nodes) runs only in the QuickJS sandbox, never with `new Function` or
  `eval` in the host process. `$script` in `input` is a marker: the host parses it and never runs
  it. Transform step `script` is a plain object (not a `$script` wrapper).
- **Graph model:** nodes, ports, branches (`$ref` in `input`), tunnels, drawn `end` terminals — see
  `realignment/graph-model.md`. **Loops:** `type: "loop"` with `mode` `for` or `forEach`; driver
  `input`, body `steps`; values after the loop are arrays. No separate `forEach` node.
- **Tests:**
  - New behaviour needs positive, negative and edge tests.
  - Coverage floors live in `vitest.config.mts`; raise them toward 90%, never lower them to
    get CI green.
  - Never use `!` globs in Vitest `test.include` (vitest#10164).
  - See `.cursor/rules/testing-coverage.mdc`.
- **No backwards-compatibility shims** unless the plan or a phase doc asks for one. See
  `.cursor/rules/no-backwards-compatibility.mdc`.
- **File formats:** executions, configs, run records and manifests are JSON. Fluent TypeScript
  is an optional authoring SDK that compiles to JSON. See `.cursor/rules/file-formats.mdc`.

## Commands

Root `package.json` is the source of truth:

```sh
pnpm install            # always from the repo root
pnpm run build          # tsc -b + App web bundle
pnpm run check          # build + manifests + lint + secrets + no-file-deps + coverage + integration + e2e + app
pnpm run test:unit
pnpm run test:coverage  # coverage gate (pre-commit + CI)
pnpm run test:integration
pnpm run test:e2e       # includes test/e2e/acceptance/A1–A12
pnpm run test:app       # Playwright A8
pnpm run bench          # budgets in bench/budgets.json
pnpm run lint
pnpm run secrets:scan
```

Pre-commit (`.husky/pre-commit`) runs `pnpm install` when lockfiles change, then lint-staged,
lint and the coverage gate. CI (`.github/workflows/ci-pipeline.yml`) runs on `main`,
`development`, `feat/**` and `milestone/**`.

## Agent skill

Contributor skill: `skills/ecp-core/`. Plugin authoring points at `plugins/plugin-test`.
