# AGENTS.md

## Read this first: the CLI reset milestone

This branch line (`milestone/cli-reset` and `feat/phase-*` branches cut from it) is executing
the ECP reset. On these branches:

1. **[`RESET-PLAN.md`](RESET-PLAN.md)** holds the decisions and the target architecture.
2. **[`reset/`](reset/README.md)** holds one detailed doc per phase: scope, file-level tasks,
   tests, exit criteria. If you were asked to execute a phase, its doc is your task list.
3. **This file and `.cursor/rules/`** describe the code as it is *now* and the rules for
   changing it. Where anything here disagrees with `RESET-PLAN.md` or a phase doc, the plan
   wins. Say so in your PR, and propose a fix to this file.

Ground rules for every phase:

- Branch `feat/phase-<n>-<slug>` from `milestone/cli-reset`; open the PR into
  `milestone/cli-reset`.
- **Never push to `main` or `development`.** Pushes to `main` publish to npm.
- Keep the pre-commit hook on. Don't skip, delete or weaken valid tests to get CI green, except
  for removals a phase doc explicitly lists.
- **Don't reintroduce Phase 1 removals** (harnesses, evals, EQL, the demo, `browser-secrets`,
  `image-policy`, Temporal, CLI `serve`/`up`/`encode`/`decode`). Don't extend code a later
  phase still removes; the status column below says which code that is.
- If a phase doc is wrong or impossible, stop and say so rather than improvising. Label
  anything stubbed, mocked or deferred honestly, in code and in the PR.
- Update the phase's status in `reset/README.md` and `RESET-PLAN.md` §7 in the same PR that
  finishes it.

## What ECP is (after the reset)

ECP is the **deterministic delegation capability** that an orchestrating agent operates: the
agent authors workflow files, runs them, reads structured errors and run journals, and repairs
and reruns them. ECP is part of a harness, never the whole harness. The primary surface is an
oclif CLI (`ecp`) whose capabilities come from npm plugins. MCP and a visual App are plugins
on top. See `RESET-PLAN.md` §0–§1.

## Repository map

| Path | What it is | Reset status |
| --- | --- | --- |
| `packages/core/` | Fluent API, registry, validation, executor, encoding, protocol types (`@executioncontrolprotocol/core`, `./types`) | Host-agnostic. Exports `.` and `./types` only. `registry-control` is in core |
| `packages/core/src/types/` | Protocol types and JSON Schemas (`@executioncontrolprotocol/core/types`) | Folded from `packages/types` in Phase 2 PR 1 |
| `packages/environments/node/` | Node host (`@executioncontrolprotocol/node`) | Includes compile, loaders, OS secrets, process-env, and the run journal |
| `packages/environments/browser/` | Browser host (`@executioncontrolprotocol/browser`) | Includes browser compile (esbuild-wasm). Authoring panels and secrets provider removed in Phase 1 |
| `packages/cli/` | `ecp` CLI (oclif 5, generated operations + hooks) | Rebuilt in Phase 3 |
| `packages/plugin-sdk/` | `toCommands`, `EcpCommand`, `defineOperation`, plugin build library | Added in Phase 3 |
| `plugins/plugin-jsonata/` | Reference plugin (`@executioncontrolprotocol/plugin-jsonata`) | Migrated in Phase 3 |
| `plugins/plugin-anthropic/` | Anthropic model provider (`@executioncontrolprotocol/plugin-anthropic`) | Migrated in Phase 5 PR 1 |
| `plugins/plugin-openai/` | OpenAI model provider (`@executioncontrolprotocol/plugin-openai`) | Migrated in Phase 5 PR 1 |
| `plugins/plugin-ollama/` | Ollama model provider (`@executioncontrolprotocol/plugin-ollama`) | Migrated in Phase 5 PR 1 |
| `packages/mcp/` | MCP adapter | Rebuilt in Phase 7 |
| `plugins/plugin-format-toon/` | TOON encode/decode (`@executioncontrolprotocol/plugin-format-toon`) | Migrated in Phase 5 PR 2. Id stays `@executioncontrolprotocol/format-toon` |
| `plugins/plugin-format-mermaid/` | Mermaid encode (`@executioncontrolprotocol/plugin-format-mermaid`) | Migrated in Phase 5 PR 2. Id stays `@executioncontrolprotocol/format-mermaid` |
| `plugins/plugin-budget/` | Budget policy | Migrated in Phase 5 PR 2 |
| `plugins/plugin-approval/` | Approval policy | Migrated in Phase 5 PR 2 |
| `plugins/plugin-state-control/` | State-control policy | Migrated in Phase 5 PR 2 |
| `packages/extensions/*/` | Empty after format plugins moved | Format packages moved in Phase 5 PR 2. Vendor plugins wait on PR 3–4 |
| `packages/vendor/*/` | Vendor extensions | Become plugins in Phase 5 (`slack` **removed in Phase 1**; `jsonata` moved in Phase 3) |
| `examples/` | Single-file `*.ecp.ts` workflows (01, 02, 03, 06, 07) | Converted in Phase 4 PR 1; vendor examples wait for Phase 5 |
| `skills/ecp-core/` | Contributor skill for this repo | Kept current with this file |
| `RESET-PLAN.md`, `reset/` | The reset plan and phase docs | Source of truth during the milestone |

Removed in Phase 1 (recoverable at `pre-reset`): `packages/harnesses/*`, `packages/evals`,
`packages/runtimes/temporal`, `apps/browser-demo`, `packages/extensions/format-reactflow`.
The demo graph editor returns as `packages/app` in Phase 8.

Target layout after the milestone: `packages/{core,cli,mcp,plugin-sdk,app}`,
`packages/environments/{node,browser}`, `plugins/plugin-*`, `examples/` (single-file
workflows). See `RESET-PLAN.md` §2.3.

## Rules that hold throughout

- **No `file:` package links.** Never put `"file:..."` in any dependency field. In-repo
  packages use `workspace:*` / `workspace:^`. Gate: `pnpm run check:no-file-deps`.
- **Core stays host-agnostic.** The `@executioncontrolprotocol/core` root entry has no Node or
  browser I/O. Exports are `.` and `./types` only. Node compile/loaders live on
  `@executioncontrolprotocol/node`; browser compile lives on `@executioncontrolprotocol/browser`.
- **Extensions never import hosts.** Extension and plugin packages depend on `core` and
  `core/types` plus focused third-party libraries, never on `node`, `browser`, `cli`
  or `mcp`. See `.cursor/rules/extensions.mdc`.
- **Operational APIs live on `Ecp` after `init()`** (`run`, `validate`, `describe`, `search`,
  `invoke`, `encode`, `decode`, `patch`, `terminate`), not on the environment builder.
- **Fluent rendering is in core** (`toFluentSource`, `ecp.encode(...).as("fluent")`). There's no
  `format-fluent` extension.
- **Workflow manifests** use `schema: "@executioncontrolprotocol.workflow"`, version `1.0`. The
  compiled manifest never contains secrets or host config. Workflow-file bindings
  (`workflow(...).with([...])`) compile into a separate `@executioncontrolprotocol.requirements`
  block, never into the manifest.
- **Secrets:**
  - Never commit live keys; use `.env` (gitignored), the OS keychain, or CI secrets.
  - Workflow and environment files reference secrets with `secrets("key")`, never values.
  - Pre-commit runs Secretlint; CI also runs Gitleaks.
- **Tests:**
  - New behaviour needs positive, negative and edge tests.
  - Coverage floors live in `vitest.config.mts`; raise them toward 90%, never lower them to
    get CI green.
  - Never use `!` globs in Vitest `test.include` (vitest#10164).
  - See `.cursor/rules/testing-coverage.mdc`.
- **No backwards-compatibility shims** unless a phase doc asks for one (Phase 9 handles npm
  deprecations). See `.cursor/rules/no-backwards-compatibility.mdc`.
- **Vendor-neutral hosts:** core, environments, CLI, MCP and the App must not branch on specific
  extension ids or output shapes. Domain knowledge lives in the extension, surfaced through
  metadata (`summary`, `useCases`, `projections`).

## Commands

```sh
pnpm install                 # always from the repo root
pnpm run build               # tsc -b tsconfig.build.json
pnpm run check               # build + schema + lint + secrets + coverage + integration + e2e
pnpm run test:unit
pnpm run test:coverage       # the coverage gate (pre-commit + CI unit job)
pnpm run test:integration
pnpm run test:e2e
pnpm run test:browser        # Vitest browser project (run test:browser:install once)
pnpm run lint
pnpm run secrets:scan
pnpm run generate:schema     # JSON Schemas (`packages/core/dist/schemas`)
```

Removed in Phase 1:

- The demo scripts (`dev:demo`, `up:demo`, `build:demo`, `test:demo`).
- The eval scripts (`test:eval:*`, `eval:*`).

Replaced by Changesets in Phase 5: `version:bump`, `publish:workspaces`,
`version:check-vs-npm`.

Pre-commit (`.husky/pre-commit`) runs `pnpm install` when lockfiles change, then lint-staged,
lint and the coverage gate. CI (`.github/workflows/ci.yml`) runs on `main`, `development`,
`feat/**` and `milestone/**`.

## CLI today and after the reset

The CLI uses oclif v5 (`@oclif/core`). Commands are generated: the CLI's own commands are
`defineOperation(...)` definitions in `packages/cli/src/operations/`, compiled with
`toCommands` from `@executioncontrolprotocol/plugin-sdk`. Plugin commands come from extension
definitions. The only hand-written oclif code is the hooks.

```sh
ecp run examples/01-echo/workflow.ecp.ts
ecp run brief.ecp.ts --to fetch
ecp run brief.ecp.ts --events
ecp validate examples/01-echo/workflow.ecp.ts
ecp describe
ecp runs list
ecp runs show <id>
ecp runs resume <id>
ecp runs rerun <id> --from web
ecp install brief.ecp.ts
ecp init brief
ecp plugins new jsonata
ecp plugins link plugins/plugin-jsonata
ecp jsonata transform --expression '$.a' --input payload.json --json
```

- **Phase 1** removed `serve`, `up`, `encode` and `decode`. **Phase 4** removed `ecp test`
  (`ecp run --to`, `ecp runs resume`, `ecp runs rerun` replace it).
- **`--env` is optional** on `run` / `validate` / `install`. Omit it to use the process host
  (built-in Node + installed plugins). `--env <file>` is an environment overlay
  (`environment(id).with([...])`), not a required pair. `describe` / `search` / `invoke` take
  it the same way.
- **`--json`** prints `{ ok: true, data }` or `{ ok: false, error: { code, message, path, suggestions } }`.
- Journals live under `.ecp/runs/<runId>/` (override with `ECP_RUNS_DIR`).

## Extension and plugin authoring

See `.cursor/rules/extensions.mdc` for the full contract. In short:

- Define with `defineExtension(...)` and `capabilityFor(...)`.
- Write product prose in `.withMetadata({ summary, description, useCases, projections })`;
  projections are required.
- Use zod schemas, imported from `"zod"` directly.
- Use `resolveFile` / `writeMediaArtifact` for binary I/O.
- The plugin contract after Phase 2:
  - Definitions are plain data. Bind `extension(definition)` / `policy(definition)`.
  - `.supports(environmentId, range?)` restricts an extension or policy to an environment.
  - Hosts register the default-exported definition with `registry.registerExtension(definition)`
    (no `register*Extension` helpers, no `globalRegistry`).
  - Phase 5 PR 2 migrated format-toon, format-mermaid, budget, approval and state-control.
    Vendor plugins wait on PR 3–4. `ecp plugins build` generates oclif files.

## Agent skill

Contributor skill for this repo: `npx skills add executioncontrolprotocol/executioncontrolprotocol --skill ecp-core -y`.
The consumer `ecp` skill lives in the docs repo; Phase 6 rewrites it.
