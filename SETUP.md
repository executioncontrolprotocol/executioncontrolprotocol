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

**Option A — no global install:** from the repo root (pass **`--config`** to an existing system config file, or copy **`config/ecp.config.example.yaml`** to **`ecp.config.yaml`** first):

```bash
npx ecp validate spec.yaml --config config/ecp.config.example.yaml --input shopifyStoreId=test --input jiraProject=TEST
npx ecp run examples/single-executor/context.yaml --config config/ecp.config.example.yaml --provider ollama --model gemma3:1b -i topic="Getting started"
```

**Option B — global `ecp` command:** link the CLI (compiled `dist/`; no global `tsx` required):

```bash
cd packages/cli && npm link && cd ../..
```

Then (with **`ecp.config.yaml`** in the repo root, or **`--config config/ecp.config.example.yaml`**):

```bash
ecp run examples/single-executor/context.yaml --config config/ecp.config.example.yaml -i topic="Getting started"
ecp validate examples/single-executor/context.yaml --config config/ecp.config.example.yaml
```

Dev without rebuilding (TypeScript source): `npm run start --workspace=@executioncontrolprotocol/cli` (pass args after `--` if your npm version requires it).

------------------------------------------------------------------------

## Tool servers (MCP) and tool permissions

ECP connects to MCP servers at runtime. The CLI no longer accepts `--tool-server` / `--tool-allow` flags; instead:

- **Tool server wiring** comes from your `ecp.config.yaml` under **`tools.servers`** (v0.5 layout).
- **Tool permissions** come from each Context manifest under `policies.toolAccess`.

### Tool server wiring (`ecp.config.yaml` -> `tools.servers`)

For example, to connect a `fetch` tool server via stdio (Docker) and a `remote` tool server via SSE:

```yaml
tools:
  servers:
    fetch:
      transport:
        type: stdio
        command: docker
        args: [run, -i, --rm, mcp/fetch]

    remote:
      transport:
        type: sse
        url: https://example.com/sse
```

Then you can run without tool-specific CLI flags:

```bash
ecp run ctx.yaml -i topic="..."
```

### Tool permissions (`Context` -> `policies.toolAccess`)

Tool permissions are defined per-executor in the Context spec. For example:

```yaml
policies:
  toolAccess:
    default: deny
    allow:
      - fetch:fetch
      - fetch:search
```

The allowed tool refs (like `fetch:fetch`) must use the same `server` name you configure in `ecp.config.yaml` under `tools.servers`.

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
   ecp run examples/single-executor/context.yaml --provider ollama --model gemma3:1b -i topic="Test"
   ```

   If you didn’t link the CLI, from the repo root (after `npm run build`):

   ```bash
   npx ecp run examples/single-executor/context.yaml --provider ollama --model gemma3:1b -i topic="Test"
   ```

### MCP tool credentials (secret providers)

Tool and HTTP credentials in Contexts use structured bindings with **`source.provider`** set to one of:

- **`process.env`** — read from the real process environment.
- **`dot.env`** — read from a `.env`-style file (default path: `secrets.providers.dot.env.path` in `ecp.config.yaml`, or override per run with **`ecp run --environment <path>`** on `run`, `validate`, `trace`, and related commands). This does **not** merge the file into `process.env`.
- **`os.secrets`** — read from the OS keychain; store values with `ecp config secrets add --provider os.secrets --key <key> --prompt`.

These are **separate namespaces** (not one merged map). Full behavior and examples: [`packages/cli/README.md`](packages/cli/README.md) (Secrets section) and root [`CHANGELOG.md`](CHANGELOG.md) for v0.4.2 breaking renames.

------------------------------------------------------------------------

## System Config (ecp.config.yaml)

ECP supports a **system config** file to allow-list plugins and set security policy. **`ecp run`** and **`ecp validate`** **require** a resolvable file: **`--config <path>`** to one YAML/JSON file, or default discovery finds **`./ecp.config.yaml`** / **`./ecp.config.json`** and/or **`~/.ecp/config.yaml`** (and related paths). If **no** file exists, those commands **fail** (host security is not optional). When both a project file and **`~/.ecp/*`** exist and **no** `--config` is passed, the CLI **merges** them (global overrides local on overlapping keys).

**Example:** copy the example and optionally edit:

```bash
cp config/ecp.config.example.yaml ecp.config.yaml
```

Then run without passing `--config`; the CLI will use `./ecp.config.yaml` if present.

See [`config/ecp.config.example.yaml`](config/ecp.config.example.yaml) for the v0.5 **`security`** mirror, **`models.providers`**, **`tools.servers`**, and related options.

------------------------------------------------------------------------

## Documentation

- **TypeScript types and API:** [packages/spec/src/types/ecp.ts](packages/spec/src/types/ecp.ts)  
- **Generated docs (TypeDoc):** From the repo root, run:

  ```bash
  pnpm run docs
  ```

  Then open the generated output (see `packages/docs` for config). A published version may be available at the [Docs badge](https://guillaumecleme.github.io/executioncontextprotocol/) link in the README.

- **Full protocol spec:** [SPEC.md](SPEC.md)  
- **Architecture and plugin registration:** [ARCHITECTURE.md](ARCHITECTURE.md)

------------------------------------------------------------------------

## Quick Reference

- **Install deps:** `npm install` or `pnpm install`
- **Link `ecp` CLI:** `npm run build` then `npm link` from `packages/cli`
- **Run a Context:** `ecp run <context.yaml> -i key=value` (requires a system config file; see **System Config** above)
- **Validate:** `ecp validate <context.yaml>` (same)
- **Use OpenAI:** set `OPENAI_API_KEY`
- **Use Ollama:** install [Ollama](https://ollama.com/), `ollama pull llama3.2:3b`, then `--provider ollama --model llama3.2:3b`
- **System config:** copy `config/ecp.config.example.yaml` to `./ecp.config.yaml` or use `--config <path>`
- **Global `ecp`:** `npm run build` then `npm link` from `packages/cli`
