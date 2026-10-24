# Dogfood B task 3 — caption and Mermaid (local MCP SDK proof)

One local pass with `ecp mcp serve` over stdio, not Claude Desktop. Same runner. Linked
`plugin-format-mermaid` and `plugin-ollama`.

This is **not** a Claude Desktop session.

## Prompt

Generate a caption with Ollama and convert the workflow to Mermaid for a PR. Start with
`format-mermaid` not installed.

## Tools

```text
ecp compile reset/dogfood/03-caption.ecp.ts --json   (CLI, same as Phase 6)
format-mermaid_encode { source, sourceSchema: "@executioncontrolprotocol.workflow" }
ecp_run { path: reset/dogfood/03-caption.ecp.ts }
```

`format-mermaid_encode` was present in `tools/list` after `plugins link`.

## Injected failure

The missing-plugin injection (`ECP_PLUGINS_MISSING` for `ecp format-mermaid`) was proven on
the CLI in Phase 6. This MCP pass started with the plugin already linked so the capability
tool existed. Do not claim a second missing-plugin capture over stdio.

## Recovery

Compile the workflow (CLI `--json`), then call `format-mermaid_encode`. Envelope `ok: true`,
`success: true`, `format: mermaid`, `result` starts with `flowchart TD` and a
`dogfood-caption` subgraph.

`ecp_run` of `03-caption.ecp.ts` failed with `ECP_STEP_FAILED`:
`Ollama API error: 404 for model "llama3.2"`. Same host limitation as Phase 6. No paid
Anthropic key was used. Run id `59ced9c1-9890-4744-89eb-05f6b0d8c590`.

## Stuck points

Ollama is reachable but the `llama3.2` tag is not installed. Mermaid encode over MCP holds.
