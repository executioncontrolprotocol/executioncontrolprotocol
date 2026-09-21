# ECP Setup Guide

This guide covers building the monorepo, installing the `ecp` CLI, and running
workflows locally (Node) or in the browser demo.

For architecture and the current spec, see:

- [`AGENTS.md`](AGENTS.md) — monorepo commands + package boundaries
- [`ecp-overhaul.md`](ecp-overhaul.md) — implementation spec (source of truth)
- [`docs/`](docs/) — browser demo, harness evals, patch model, etc.

------------------------------------------------------------------------

## Prerequisites

- **Node.js** 22+
- **pnpm** (monorepo package manager; see `packageManager` in root `package.json`)
- For **OpenAI** (optional): an API key via `OPENAI_API_KEY`
- For **Ollama** (optional): [Ollama](https://ollama.com/) running locally

------------------------------------------------------------------------

## Install + build

```bash
git clone https://github.com/executioncontrolprotocol/executioncontrolprotocol.git
cd executioncontrolprotocol
pnpm install
pnpm run build
```

Always run `pnpm install` from the repo root, not inside individual packages.

------------------------------------------------------------------------

## Install the CLI

### Published (recommended for consumers)

```bash
npm install -g @executioncontrolprotocol/cli
```

### Monorepo development

From the repo root (after `pnpm run build`):

```bash
cd packages/cli
pnpm link --global
cd ../..
```

Now `ecp --help` should work.

Alternatively, run the dev entry without linking:

```bash
pnpm --filter @executioncontrolprotocol/cli start
```

------------------------------------------------------------------------

## Run a workflow (Node)

ECP runs **workflows** (`@executioncontrolprotocol.workflow`) inside **environments** (runtime +
extensions + policies). Examples are authored in TypeScript but compile down to
portable JSON workflow manifests.

```bash
ecp run examples/01-echo/workflow.ts --env examples/01-echo/environment.ts
ecp validate examples/01-echo/workflow.ts --env examples/01-echo/environment.ts
```

Compile to JSON (optional):

```bash
ecp compile examples/01-echo/workflow.ts -o dist/workflow.json
```

------------------------------------------------------------------------

## Provider configuration

### OpenAI

Set:

- `OPENAI_API_KEY`

On Windows (PowerShell):

```powershell
$env:OPENAI_API_KEY = "sk-..."
```

### Ollama

- Default base URL: `http://localhost:11434`
- Pull a model:

```bash
ollama pull gemma3:1b
```

------------------------------------------------------------------------

## Browser demo

The browser demo app lives in this monorepo at [`apps/browser-demo`](apps/browser-demo).

```bash
pnpm install
pnpm run build
pnpm run dev:demo
```

GitHub Pages deploys that app from `main` (`.github/workflows/pages.yml`) after a workspace install and `pnpm run build`.

------------------------------------------------------------------------

## Quality gate (recommended before PRs)

From the repo root:

```bash
pnpm run check
```
