# ECP Setup Guide

This guide covers installing the ECP CLI, configuring model providers (OpenAI and Ollama), environment variables, and system config.

------------------------------------------------------------------------

## Prerequisites

- **Node.js** 22+ (required for schema generation / full build)
- **npm** (v7+ for workspaces) or **pnpm**
- For **OpenAI**: an [OpenAI API key](https://platform.openai.com/api-keys)
- For **Ollama** (optional): [Ollama](https://ollama.com/) installed and running locally

------------------------------------------------------------------------

## Clone and Install

```bash
git clone https://github.com/GuillaumeCleme/executioncontextprotocol.git
cd executioncontextprotocol
```

Using **npm**:

```bash
npm install
```

Using **pnpm**:

```bash
pnpm install
```

------------------------------------------------------------------------

## Running the CLI

Build **spec → runtime → cli** from the repo root (TypeScript emits to each package’s `dist/`):

```bash
npm install
npm run build
```

**Option A — no global install:** from the repo root:

```bash
npx ecp validate spec.yaml --input shopifyStoreId=test --input jiraProject=TEST
npx ecp run examples/single-executor/context.yaml --enable openai -i topic="Getting started"
```

**Option B — global `ecp` command:** link the CLI (compiled `dist/`; no global `tsx` required):

```bash
cd packages/cli && npm link && cd ../..
```

Then:

```bash
ecp run examples/single-executor/context.yaml --enable openai -i topic="Getting started"
ecp validate examples/single-executor/context.yaml
```

Dev without rebuilding (TypeScript source): `npm run start --workspace=@executioncontrolprotocol/cli` (pass args after `--` if your npm version requires it).

------------------------------------------------------------------------

## Tool servers (MCP) and tool permissions

ECP connects to MCP servers at runtime. The CLI supports two concerns:

- **Tool server wiring** (how to start/connect to MCP servers)
- **Tool permissions** (which executors are allowed to call which tools)

### Tool server wiring

Prefer the simple, repeatable `--tool-server` flag:

- **stdio**: `--tool-server name=stdio:command[,arg1,arg2...]`
- **sse**: `--tool-server name=sse:url`

Examples:

```bash
ecp run ctx.yaml ^
  --tool-server fetch=stdio:docker,run,-i,--rm,mcp/fetch
```

```bash
ecp run ctx.yaml ^
  --tool-server remote=sse:https://example.com/sse
```

### Tool permissions (per-executor allow-lists)

Prefer the simple, repeatable `--tool-allow` flag:

- `--tool-allow executor=server:tool[,server:tool...]`

Example:

```bash
ecp run ctx.yaml ^
  --tool-server fetch=stdio:docker,run,-i,--rm,mcp/fetch ^
  --tool-allow web_summarizer=fetch:fetch
```

------------------------------------------------------------------------

## Install the CLI Globally (optional)

Same as **Option B** above: `npm run build`, then `cd packages/cli && npm link`.

------------------------------------------------------------------------

## Environment Configuration

### OpenAI

The OpenAI provider uses the **OpenAI API key** from the environment by default.

Set one of:

- **`OPENAI_API_KEY`** — standard env var used by the runtime.

Example:

```bash
export OPENAI_API_KEY=sk-...
```

On Windows (PowerShell):

```powershell
$env:OPENAI_API_KEY = "sk-..."
```

You can also pass a key via provider config when building a custom runtime; the CLI relies on this env var for the built-in OpenAI provider.

### Ollama

- **Default base URL:** `http://localhost:11434`
- **CLI override:** `--ollama-base-url <url>`
- **Env override (for custom runtimes/tests):** `OLLAMA_BASE_URL`  
  Example: `export OLLAMA_BASE_URL=http://localhost:11434`
- **Model:** By default the CLI uses the model in the Context (e.g. `gpt-4o-mini` for OpenAI). For Ollama, use a model you have pulled (e.g. `llama3.2:3b`, `gemma3:1b`). Override with `--model <name>`.

**Recommended model for MCP / tool calling:** **`llama3.2:3b`** — supports tool/function calling well and runs locally. Pull it with:

```bash
ollama pull llama3.2:3b
```

Lighter alternative: `ollama pull llama3.2:1b`. Other options with good tool support: `qwen2.5:3b`, `mistral`, `llama3.1`.

**Run with Ollama:**

1. Install and start [Ollama](https://ollama.com/).
2. Pull a model: `ollama pull llama3.2`
3. Run ECP with the Ollama provider:

   ```bash
   ecp run examples/single-executor/context.yaml --provider ollama --enable ollama --model llama3.2:3b -i topic="Test"
   ```

   If you didn’t link the CLI, from the repo root (after `npm run build`):

   ```bash
   npx ecp run examples/single-executor/context.yaml --provider ollama --enable ollama --model llama3.2:3b -i topic="Test"
   ```

------------------------------------------------------------------------

## System Config (ecp.config.yaml)

ECP supports a **system config** file to allow-list extensions and set security policy. The CLI loads it from (in order):

1. Path given by **`--config <path>`**
2. **`./ecp.config.yaml`** (current directory)
3. **`~/.ecp/config.yaml`** or **`~/.ecp/ecp.config.yaml`**

**Example:** copy the example and optionally edit:

```bash
cp config/ecp.config.example.yaml ecp.config.yaml
```

Then run without passing `--config`; the CLI will use `./ecp.config.yaml` if present.

See [`config/ecp.config.example.yaml`](config/ecp.config.example.yaml) for `allowEnable`, `defaultEnable`, and `security` options.

------------------------------------------------------------------------

## Documentation

- **TypeScript types and API:** [packages/spec/src/types/ecp.ts](packages/spec/src/types/ecp.ts)  
- **Generated docs (TypeDoc):** From the repo root, run:

  ```bash
  pnpm run docs
  ```

  Then open the generated output (see `packages/docs` for config). A published version may be available at the [Docs badge](https://guillaumecleme.github.io/executioncontextprotocol/) link in the README.

- **Full protocol spec:** [SPEC.md](SPEC.md)  
- **Architecture and extension registration:** [ARCHITECTURE.md](ARCHITECTURE.md)

------------------------------------------------------------------------

## Quick Reference

| Goal              | Command / step |
|-------------------|----------------|
| Install deps      | `npm install` or `pnpm install` |
| Link `ecp` CLI    | `npm run build` then `npm link` from `packages/cli` |
| Run a Context     | `ecp run <context.yaml> --enable openai -i key=value` |
| Validate          | `ecp validate <context.yaml>` |
| Use OpenAI        | Set `OPENAI_API_KEY` |
| Use Ollama        | Install [Ollama](https://ollama.com/), `ollama pull llama3.2:3b`, then `--provider ollama --enable ollama --model llama3.2:3b` |
| System config     | Copy `config/ecp.config.example.yaml` to `./ecp.config.yaml` or use `--config <path>` |
| Global `ecp`      | `npm run build` then `npm link` from `packages/cli` |
