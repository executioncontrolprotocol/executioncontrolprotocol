# AGENTS.md

## Cursor Cloud specific instructions

This is a **monorepo** for the Execution Control Protocol (ECP), using npm workspaces.

Coding standards for AI agents (DRY, minimal focused changes, testing expectations) live in [`.cursor/rules/general.mdc`](.cursor/rules/general.mdc).

### Repository structure

| Path | Purpose |
| ---- | ------- |
| `packages/spec/` | TypeScript types, JSON Schema generation, spec validation |
| `packages/runtime/` | ECP execution engine (providers, protocols, mounts, policies) |
| `packages/cli/` | CLI tool: `ecp run` and `ecp validate` |
| `packages/docs/` | Mintlify documentation site (MDX); optional TypeDoc for API reference |
| `examples/` | Example Context manifests (single-executor, controller-specialist) |
| `spec.yaml` | Canonical ECP Context example |

### NPM scripts (run from repo root)

| Command | What it does |
| ------- | ------------ |
| `npm run build` | TypeScript type-check all packages (spec → runtime → cli) |
| `npm run generate:schema` | Generate JSON Schema from spec types |
| `npm run lint` | ESLint + markdownlint |
| `npm run validate` | Validate `spec.yaml` via AJV + structural checks |
| `npm run docs` | Start Mintlify doc preview at http://localhost:3000 (run from repo root) |
| `npm run docs:typedoc` | Build TypeDoc API reference in packages/docs/dist |
| `npm run check` | Full suite: build + generate:schema + lint + validate + test |
| `npm run test:e2e` | E2E tests with real Ollama model (requires running Ollama) |
| `npm run test:coverage` | Run tests with coverage report; target minimum 90% |

### Running the CLI

```sh
ecp run <context.yaml> --config ecp.config.yaml --input key=value --debug
ecp validate <context.yaml> --config ecp.config.yaml
```

**System config:** `ecp run` and `ecp validate` require a resolvable system config (`./ecp.config.yaml`, `~/.ecp/config.yaml`, or `--config <path>`). Without any file, the CLI exits with an error.

Requires `OPENAI_API_KEY` for `ecp run` (with default OpenAI provider).
Use `--provider ollama` for local Ollama models (no API key needed).

Context manifests have required inputs. Pass them with `--input`:

```sh
ecp validate spec.yaml --input shopifyStoreId=demo --input jiraProject=DEMO
ecp validate examples/single-executor/context.yaml --input topic=test
ecp validate examples/controller-specialist/context.yaml --input subject=test
```

### Gotchas

- **Build before using CLI.** `dist/` directories are gitignored; after `npm install`, run `npm run build` before the `ecp` CLI works. To link the CLI globally: `cd packages/cli && npm link && cd ../..`
- **Pre-commit hook** runs `npm run lint && npm run test:unit` (via Husky). Both must pass before any commit.
- **Monorepo with npm workspaces.** Always run `npm install` from the repo root.
- **Build order matters:** spec → runtime → cli (composite project references).
- **No Python.** All tooling is NPM-based.
- **AJV CJS/ESM interop:** use the shared `Ajv` export from `@executioncontrolprotocol/spec` (see `packages/spec/src/ajv.ts`).
- **Import extensions:** `Node16` module resolution — all local imports end with `.js`.
- **Schema is a build output:** `packages/spec/dist/ecp-context.schema.json` is generated.
- **spec.yaml lives at repo root.** The validator resolves it via `import.meta.dirname`.
- **E2E tests auto-skip** when Ollama is not running — safe in `npm run test` and `npm run check`.
- **CI E2E job** installs Ollama + `gemma3:1b` on every push/PR; runs `npm run test:e2e`.
- **No emojis.** Do not add emoji characters anywhere in the codebase (source, CLI output, logs, or comments).

### Testing

- **Always include tests for new features.** Every new feature or behavior change must have corresponding unit or integration tests.
- **Minimum test coverage: 90%.** The project targets at least 90% coverage (lines, functions, branches, statements). Run `npm run test:coverage` to view the report. Add or update tests when adding code to maintain or reach this target. Threshold enforcement in CI can be enabled once coverage meets 90%.
