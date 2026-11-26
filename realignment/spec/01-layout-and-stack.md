# 01 — Layout and stack

## Repository layout

Phase 0 moves all legacy code under `legacy/` and takes it **out of the pnpm workspace, the
TypeScript build, lint, tests and CI**. Legacy code stays readable as reference until Phase 9
deletes `legacy/`. This removes npm-name collisions (new packages reuse names like `cli` and
`app`) and keeps CI about new code only.

```text
/
├── packages/                     new MVP packages (pnpm workspace)
│   ├── protocol/                 @executioncontrolprotocol/protocol
│   ├── engine/                   @executioncontrolprotocol/engine
│   ├── quickjs/                  @executioncontrolprotocol/quickjs
│   ├── formatters/               @executioncontrolprotocol/formatters
│   ├── local/                    @executioncontrolprotocol/local
│   ├── plugin-sdk/               @executioncontrolprotocol/plugin-sdk
│   ├── host/                     @executioncontrolprotocol/host
│   ├── mcp-relay/                @executioncontrolprotocol/mcp-relay
│   ├── cli/                      @executioncontrolprotocol/cli   (bin: ecp)
│   └── app/                      @executioncontrolprotocol/app
├── plugins/                      new plugins (pnpm workspace)
│   ├── plugin-test/              @executioncontrolprotocol/test
│   ├── plugin-anthropic/         @executioncontrolprotocol/anthropic
│   ├── plugin-azure-blob-storage/
│   └── plugin-adobe-firefly-services/
├── fixtures/                     conformance fixtures (see 12)
├── bench/                        benchmarks (see 12)
├── examples/                     v2 example executions (*.ecp.json), converted in Phase 8
├── realignment/                  plan phase docs and this spec
├── legacy/                       old packages, plugins, examples (reference only; deleted in Phase 9)
└── REALIGNMENT-PLAN.md, AGENTS.md, CLAUDE.md, .cursor/rules/, skills/ecp-core/
```

Phase 9 removed `legacy/` from the repository; the tree above is the Phase 0 layout record plus
that fact.

## Packages and their boundaries

| Package | Depends on | Owns | MUST NOT |
| --- | --- | --- | --- |
| `protocol` | nothing (zero runtime deps) | TypeScript types, JSON Schemas (manifest, objects, operations), error code catalogue, constants | Do I/O; contain logic beyond tiny pure helpers |
| `engine` | `protocol`, `ajv`, `ajv-formats`, `acorn` | Service container, schema generation, validation (all layers), executor, value resolution, patch application, retrieve matching | Do I/O directly (everything through services); import Node built-ins other than `node:crypto`'s `randomUUID` via an injected id generator |
| `quickjs` | `protocol`, `quickjs-emscripten` | `ExpressionEngine` implementation | Anything else |
| `formatters` | `protocol`, `@toon-format/toon` | `Formatter` implementations: `json`, `toon` | — |
| `local` | `protocol`, `engine` (types only), `@napi-rs/keyring` | `localstorage` (`StorageProvider`), local secrets (`SecretsProvider`), `LocalPluginRegistration` (`PluginAdapter`) | Know about HTTP or the CLI |
| `plugin-sdk` | `protocol`, `zod` (peer) | `definePlugin`, `capability`, handler types, `ecp-plugin-manifest` bin | Import host, CLI, relay or App |
| `host` | `protocol`, `engine`, `quickjs`, `formatters`, `local` | Host process entry, HTTP API `Endpoint`, local token `Auth`, supervisor process entry, `host.json`, App static serving | Import `cli` or `mcp-relay` |
| `mcp-relay` | `protocol`, `@modelcontextprotocol/sdk` | Stdio MCP server forwarding to the host API; host discovery and start | Import `engine` or run capabilities |
| `cli` | `protocol`, `host` (for in-process mode and to locate entries), `mcp-relay`, `@oclif/core`, `@oclif/plugin-plugins`, `@oclif/plugin-help`, `@oclif/plugin-not-found` | oclif commands, host discovery, in-process fallback, plugin install hooks, secrets commands | Implement operation logic (it calls the engine through `host`'s in-process API or HTTP) |
| `app` | `protocol`, `react`, `react-dom`, `@xyflow/react`, `@monaco-editor/react` | Prebuilt web bundle served by `host` at `/app/` | Talk to anything but the host HTTP API |
| `plugin-*` | `plugin-sdk` (peer), `zod` (peer), focused SDKs | Capabilities | Import any package except `plugin-sdk`, `protocol` (types) and their own deps |

Plugins declare `@executioncontrolprotocol/plugin-sdk` and `zod` as **peer dependencies** so a
plugin's install folder never carries its own copy and the registry never splits.

## Toolchain and versions

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 22 LTS (`>=22.12`) | `engines` in every package |
| pnpm | 10.x (`packageManager` field) | Workspace root installs only |
| TypeScript | 5.9 | `strict`, `module`/`moduleResolution` `NodeNext`, ESM only, `.js` import suffixes |
| Vitest | 4.x | Unit, integration, e2e projects; `@vitest/coverage-v8` |
| zod | 4.x (catalog bumped from 3 in Phase 0) | Plugins only; JSON Schema via `z.toJSONSchema` |
| ajv / ajv-formats | 8.x / 3.x | Draft 2020-12 (`ajv/dist/2020`) |
| acorn | 8.x | Syntax checks for `expr`, `$expr`, `$script` |
| quickjs-emscripten | latest 0.31.x | Sync WASM variant; one runtime per host, one context per evaluation |
| @modelcontextprotocol/sdk | 1.x (latest minor) | Stdio server in `mcp-relay`; client in tests |
| @oclif/core | 4.x or 5.x as already used by legacy CLI (5.x) | Keep 5.x |
| @oclif/plugin-plugins | 5.5.2 (pinned) | Library for `ecp plugins install\|link\|…` only; not an oclif loaded plugin |
| @napi-rs/keyring | 1.x | Same naming rules as legacy (`.cursor/rules/secrets-keyring.mdc`) |
| @toon-format/toon | 2.x | TOON formatter |
| React / @xyflow/react / Monaco | 19 / 12 / latest | App only |
| Playwright | as in repo | App e2e; use preinstalled browsers where available |

## TypeScript and build

- One `tsconfig.base.json` (strict, `NodeNext`, `declaration`, `sourceMap`), project references
  per package, `pnpm run build` = `tsc -b tsconfig.build.json` (App also runs `vite build`).
- Every package: `src/`, `test/`, `dist/` (gitignored), `package.json` with `exports` (`.` and
  explicit subpaths only), `types`, `files: ["dist"]`, `type: "module"`.
- JSDoc with `@category` on every export (`.cursor/rules/typescript.mdc`).

## Root scripts (replace the legacy ones in Phase 0)

| Script | Does |
| --- | --- |
| `build` | `tsc -b tsconfig.build.json` + App bundle |
| `lint` | ESLint (flat config) + markdownlint + yaml lint |
| `test:unit` | Vitest unit project (all packages) |
| `test:coverage` | Unit project with V8 coverage and thresholds (the gate) |
| `test:integration` | Vitest integration project (in-process host, temp `ECP_HOME`) |
| `test:e2e` | Vitest e2e project (spawned `ecp` processes, supervisor, relay over stdio) |
| `test:app` | Playwright App tests |
| `test:conformance` | Fixture suite against `engine` (also part of `test:unit`) |
| `bench` | `node bench/run.mjs` (see 12) |
| `check` | build + lint + secrets scan + coverage + integration + e2e + app |
| `check:no-file-deps` | Keep the legacy gate (no `file:` deps) |
| `secrets:scan` | Secretlint (Gitleaks stays in CI) |

## Coverage

Floors in `vitest.config.mts` for new packages start at **90 % lines, functions, statements and
85 % branches** (new code; these are floors, raise only). Legacy thresholds are removed with
legacy from the workspace.

## CI

- `.github/workflows/ci.yml` keeps running on `main`, `development`, `feat/**`, `milestone/**`.
- Jobs: `build`, `lint`, `unit` (coverage gate), `integration`, `e2e` (Ubuntu + Windows),
  `app` (Ubuntu), `bench` (Ubuntu, report only; fails only on budget breach once budgets are
  set in Phase 5).
- Required-check names are copied exactly into `.github/rulesets/` when job names change
  (`.cursor/rules/github-rulesets.mdc`).
- Live-service tests (Anthropic, Firefly, Azure) run only when their secrets exist; they skip
  cleanly otherwise and are never part of the coverage gate.

## Environment variables

| Variable | Default | Used by |
| --- | --- | --- |
| `ECP_HOME` | `~/.ecp` | Everything (tests always set a temp dir) |
| `ECP_DATA_DIR` | `$ECP_HOME/plugins` | oclif plugin data dir (set by the CLI) |
| `ECP_HOST_TOKEN` | — | Passed from supervisor to host process only (never argv) |
| `ECP_TIMING` | unset | `1` prints the per-phase timing breakdown (stderr) |
| `ECP_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `ECP_SECRET_<KEY>` | — | Read-only secret fallback (see 05) |
