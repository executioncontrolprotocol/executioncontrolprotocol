# AGENTS.md

## Read this first: the realignment milestone

This branch line (`milestone/realignment` and `feat/realignment-*` branches cut from it) is
executing the ECP realignment.

1. **[`realignment/spec/`](realignment/spec/README.md)** is the MVP build spec: exact contracts. It wins
   over everything else.
2. **[`REALIGNMENT-PLAN.md`](REALIGNMENT-PLAN.md)** holds the decisions, architecture and rationale.
3. **[`realignment/`](realignment/README.md)** holds the phase docs. If you were asked to
   execute a phase, its doc is your task list.
4. **This file and `.cursor/rules/`** hold the rules for working in the repo. Where anything
   here disagrees with the plan or a phase doc, the plan wins: say so in your PR and propose a
   fix to this file.

The previous milestone's plan (the CLI reset, `RESET-PLAN.md` and `reset/`) was retired on
2026-11-14. What still applies is in the plan's "Carried over from the CLI reset" section; the
originals are in git history (`git show 27238c96:RESET-PLAN.md`). Don't resurrect them as
instructions.

Ground rules:

- **Build from the spec.** `realignment/spec/` fixes every MVP contract; implement it as written,
  phase by phase (`realignment/README.md`). To change a contract, change the spec first in the
  same PR and say why. Throwaway spikes and benchmarks go in `realignment/spikes/`.
- Branch `feat/realignment-<phase>-<slug>` from `milestone/realignment`; open PRs into
  `milestone/realignment`.
- **Never push to `main` or `development`.** Pushes to `main` publish to npm.
- **The existing packages are legacy reference code.** Read them for what to carry over (plan:
  "What carries over"). Don't extend them or add features to them. A legacy package is deleted
  in the PR that replaces it.
- Keep the pre-commit hook on. Don't skip, delete or weaken valid tests to get CI green, except
  for removals a phase doc explicitly lists.
- If the plan or a phase doc is wrong or impossible, stop and say so rather than improvising.
  Label anything stubbed, mocked or deferred honestly, in code and in the PR.

## What ECP is (target)

An **ECP host** runs **executions**: JSON manifests of capability steps with routing (parallel,
branch, loop, `expr` gates). The host validates every capability call against the
capability's `accepts`/`returns` schemas. Plugins only provide capabilities; they're loaded into
the host process on first call, from per-plugin manifests. Agents use exactly three
operations, `retrieve`, `execute`, `commit`, through an MCP relay, the CLI, or the host's
localhost HTTP API. Every key host component is a swappable **service**
(`environment.use(Impl, Interface.service)`). Policies are out of scope for now.

Full picture, vocabulary and diagrams: `REALIGNMENT-PLAN.md`.

## Principles

- **Delegation, not orchestration.** ECP serves the agent that operates it; don't build
  features that try to think for the agent.
- **Model-legible everywhere.** `--json` on every command, stable `ECP_*` codes with paths and
  suggestions, structured run records, help and metadata written for a model reader.
- **The self-healing loop is the product.** Every failure legible, every fix cheap to retry.
- **Core does no I/O.** Everything external goes through services.
- **Trim before building.** Don't port legacy code the plan doesn't need.
- **Be honest about stubs.** Label anything mocked or unimplemented; never ship it as real.
- **Hosted never diverges.** Hosted ECP adds service implementations and plugins, never
  execution semantics.

## Repository map (legacy code, and what happens to it)

| Path | What it is today | In the realignment |
| --- | --- | --- |
| `legacy/packages/core/` | Fluent API, registry, validation, executor, encoding, protocol types | Reference. Manifest types, executor routing, input resolution, commit modes, validation and the Fluent builder carry over (adapted). The policy engine and requirements/bindings don't |
| `legacy/packages/environments/node/` | Node host: compile, loaders, OS secrets, process-env, run journal | Reference. OS keychain naming and the journal shape carry over |
| `legacy/packages/environments/browser/` | Browser host | Out of scope |
| `legacy/packages/cli/` | `ecp` CLI (oclif, generated operations) | Reference. oclif plugin management and `plugins link` carry over; generated per-capability commands don't |
| `legacy/packages/plugin-sdk/` | `toCommands`, `defineOperation`, plugin build | Reference. Per-capability command generation is dropped |
| `legacy/packages/mcp/` | MCP server exposing tools per capability | Replaced by the MCP relay (three tools) |
| `legacy/packages/app/`, `legacy/plugins/plugin-app/` | Visual App and its CLI plugin | Reference. Graph mapping and run overlay carry over onto the host API |
| `legacy/plugins/plugin-test/`, `plugin-anthropic/`, `plugin-adobe-firefly-services/`, `plugin-azure-blob-storage/` | Capability plugins | First to be ported to the new plugin API |
| `legacy/plugins/plugin-openai/`, `plugin-ollama/`, `plugin-fal/`, `plugin-image-sharp/`, `plugin-jsonata/` | Capability plugins | Ported later, as needed |
| `legacy/plugins/plugin-format-toon/`, `plugin-format-mermaid/` | Format capabilities | Become `Formatter` service implementations, not plugins |
| `legacy/plugins/plugin-budget/`, `plugin-approval/`, `plugin-state-control/` | Policies | Out of scope until policies return |
| `legacy/examples/` | `*.ecp.ts` workflow files, including `examples/dogfood/` (agent-repair tasks with injected failures) | Converted to v2 fixtures in `fixtures/v1/`; v2 examples return in Phase 8 |
| `skills/ecp-core/` | Contributor skill for this repo | Rewritten for the realignment; keep it in step with this file |
| `REALIGNMENT-PLAN.md`, `realignment/`, `realignment/spec/` | The plan, phase docs and MVP build spec | Source of truth |

Phase 0 moves every legacy path above to `legacy/` (outside the workspace and CI); Phase 9 deletes it.
The Fluent SDK is a post-MVP phase (`realignment/post-mvp-fluent-sdk.md`): no MVP work adds Fluent.

## Rules that hold throughout

- **No `file:` package links.** Never put `"file:..."` in any dependency field. In-repo
  packages use `workspace:*` / `workspace:^`. Gate: `pnpm run check:no-file-deps`.
- **Secrets:**
  - Never commit live keys; use `.env` (gitignored), the OS keychain, or CI secrets.
  - Executions never contain secrets or `$secret`/`$env` references. Config objects hold
    `{ "$secret": "key" }` references; values live in the secrets provider and are set outside
    MCP (`ecp secrets set`).
  - Pre-commit runs Secretlint; CI also runs Gitleaks.
- **Plugins never import hosts.** Plugin packages depend on the plugin authoring package (as a
  peer dependency) and focused third-party libraries, never on the host, CLI, relay or App
  packages. Heavy SDKs stay in their own plugin package.
- **Vendor-neutral host:** the host, CLI, relay and App must not branch on specific capability
  ids or output shapes. Domain knowledge lives in the plugin, surfaced through metadata and
  schemas.
- **JS in executions:** host-evaluated JavaScript (`expr`, `$expr`) runs only in the QuickJS
  sandbox, never with `new Function` or `eval` in the host process. `$script` is a value: the
  host parses it and never runs it.
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

## Commands (legacy code)

These run the existing packages and their tests. New packages add their scripts to the root
`package.json` as they land.

```sh
pnpm install                 # always from the repo root
pnpm run build               # tsc -b tsconfig.build.json
pnpm run check               # build + schema + lint + secrets + coverage + integration + e2e
pnpm run test:unit
pnpm run test:coverage       # the coverage gate (pre-commit + CI unit job)
pnpm run test:integration
pnpm run test:e2e
pnpm run lint
pnpm run secrets:scan
```

Pre-commit (`.husky/pre-commit`) runs `pnpm install` when lockfiles change, then lint-staged,
lint and the coverage gate. CI (`.github/workflows/ci.yml`) runs on `main`, `development`,
`feat/**` and `milestone/**`.

## Agent skill

Contributor skill for this repo: `skills/ecp-core/` (rewritten for the realignment). The
consumer `ecp` skill in `executioncontrolprotocol/docs` describes the published 0.52 CLI, not
the realignment.
