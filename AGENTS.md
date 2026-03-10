# AGENTS.md

## Cursor Cloud specific instructions

This is a **monorepo** for the Execution Control Protocol (ECP), using npm workspaces.

### Repository structure

| Path | Purpose |
|---|---|
| `packages/spec/` | TypeScript types, JSON Schema generation, spec validation |
| `packages/runtime/` | ECP execution engine (providers, protocols, mounts, policies) |
| `packages/cli/` | CLI tool: `ecp run` and `ecp validate` |
| `packages/docs/` | Mintlify documentation site (MDX); optional TypeDoc for API reference |
| `examples/` | Example Context manifests (single-executor, controller-specialist) |
| `spec.yaml` | Canonical ECP Context example |

### NPM scripts (run from repo root)

| Command | What it does |
|---|---|
| `npm run build` | TypeScript type-check all packages (spec → runtime → cli) |
| `npm run generate:schema` | Generate JSON Schema from spec types |
| `npm run lint` | ESLint + markdownlint |
| `npm run validate` | Validate `spec.yaml` via AJV + structural checks |
| `npm run docs` | Start Mintlify doc preview at http://localhost:3000 (run from repo root) |
| `npm run docs:typedoc` | Build TypeDoc API reference in packages/docs/dist |
| `npm run check` | Full suite: build + generate:schema + lint + validate + test |
| `npm run test:e2e` | E2E tests with real Ollama model (requires running Ollama) |

### Running the CLI

```sh
npx tsx packages/cli/src/index.ts run <context.yaml> --input key=value --debug
npx tsx packages/cli/src/index.ts validate <context.yaml>
```

Requires `OPENAI_API_KEY` for `ecp run` (with default OpenAI provider).
Use `--provider ollama` for local Ollama models (no API key needed).

Context manifests have required inputs. Pass them with `--input`:

```sh
npx tsx packages/cli/src/index.ts validate spec.yaml --input shopifyStoreId=demo --input jiraProject=DEMO
npx tsx packages/cli/src/index.ts validate examples/single-executor/context.yaml --input topic=test
npx tsx packages/cli/src/index.ts validate examples/controller-specialist/context.yaml --input subject=test
```

### Gotchas

- **Monorepo with npm workspaces.** Always run `npm install` from the repo root.
- **Build order matters:** spec → runtime → cli (composite project references).
- **No Python.** All tooling is NPM-based.
- **AJV CJS/ESM interop:** runtime and spec use `_Ajv.default ?? _Ajv` pattern.
- **Import extensions:** `Node16` module resolution — all local imports end with `.js`.
- **Schema is a build output:** `packages/spec/dist/ecp-context.schema.json` is generated.
- **spec.yaml lives at repo root.** The validator resolves it via `import.meta.dirname`.
- **E2E tests auto-skip** when Ollama is not running — safe in `npm run test` and `npm run check`.
- **CI E2E job** installs Ollama + `gemma3:1b` on every push/PR; runs `npm run test:e2e`.
- **No emojis.** Do not add emoji characters anywhere in the codebase (source, CLI output, logs, or comments).
