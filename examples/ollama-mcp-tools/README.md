# Ollama + MCP tools (ECP examples)

This folder contains **ECP Context** examples that use an **Ollama model** and invoke **MCP tools**.

## Prereqs

- Ollama running locally (default: `http://localhost:11434`)
- An Ollama model pulled (example uses `llama3.2:3b`)
- ECP CLI available (`npm i` at repo root, then `npm run build`)

## Example A — public MCP (`mcp-server-fetch`)

This uses the public `mcp-server-fetch` server (tool name: `fetch`).

Run:

```bash
node packages/cli/dist/index.js run examples/ollama-mcp-tools/context-fetch-toolcalling.yaml ^
  --provider ollama ^
  --model llama3.2:3b ^
  --input url=https://example.com ^
  --tool-server fetch=stdio:docker,run,-i,--rm,mcp/fetch ^
  --tool-allow web_summarizer=fetch:fetch
```

Notes:
- If you prefer `uvx`, replace the `command/args` with `uvx mcp-server-fetch` and (on Windows) set `PYTHONIOENCODING=utf-8`.

## Example B — local fake MCP server (deterministic)

This runs a tiny local MCP server (TypeScript over stdio) so you can test MCP wiring without Docker, Python, or network.

Run:

```bash
node packages/cli/dist/index.js run examples/ollama-mcp-tools/context-fake-jira-mounts.yaml ^
  --provider ollama ^
  --model llama3.2:3b ^
  --input project=OPS ^
  --tool-server test-jira=stdio:npx,tsx,examples/ollama-mcp-tools/servers/fake-mcp-server.ts
```

