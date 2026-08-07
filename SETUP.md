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
- **npm** (workspaces)
- For **OpenAI** (optional): an API key via `OPENAI_API_KEY`
- For **Ollama** (optional): [Ollama](https://ollama.com/) running locally

------------------------------------------------------------------------

## Install + build

```bash
git clone https://github.com/GuillaumeCleme/executioncontextprotocol.git
cd executioncontextprotocol
npm install
npm run build
```

------------------------------------------------------------------------

## Install the CLI (recommended)

From the repo root (after `npm run build`):

```bash
cd packages/cli
npm link
cd ../..
```

Now `ecp --help` should work.

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

The browser demo app lives in a **separate repository**:

[https://github.com/GuillaumeCleme/executioncontrolprotocol-browser-demo](https://github.com/GuillaumeCleme/executioncontrolprotocol-browser-demo)

Clone it as a sibling of this repo and follow its README (`npm install`, `npm run dev`). For local ECP development, use `npm link` as documented there.

------------------------------------------------------------------------

## Quality gate (recommended before PRs)

From the repo root:

```bash
npm run check
```
