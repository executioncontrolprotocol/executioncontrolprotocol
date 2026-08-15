# `@executioncontrolprotocol/mcp`

MCP (Model Context Protocol) adapter that exposes an initialized ECP environment to agents.

## Status

MCP tools cover discovery, validation, workflow run, and encode/decode. **Capability invoke is not yet an MCP tool.** To call a single capability outside a workflow, use:

- Fluent API: `ecp.invoke(capabilityId).with(input).process()`
- CLI: `ecp invoke <capability-id> --env environment.ts --input input.json`
- HTTP: `ecp serve --env environment.ts` then `POST /v1/invoke` (or `ecp up` for the Ollama demo bridge)

## Tools (current)

| Tool | Maps to |
| ---- | ------- |
| `ecp.describe_environment` | `ecp.describe` |
| `ecp.search` | `ecp.search` |
| `ecp.validate_workflow` | `ecp.validate` |
| `ecp.run_workflow` | `ecp.run` |
| `ecp.encode` | `ecp.encode` |
| `ecp.decode` | `ecp.decode` |
| `ecp.get_run_status` | in-process run store |

## Resources

| Resource | URI |
| -------- | --- |
| Environment descriptor | `ecp://environment/describe` |
| Capabilities | `ecp://capabilities` |
| Capability detail | `ecp://capabilities/{id}` |
| Policies | `ecp://policies` |
| Run detail | `ecp://runs/{runId}` |

## Usage

```ts
import { createEcpMcpServer, serveStdio } from "@executioncontrolprotocol/mcp"
import { environment } from "@executioncontrolprotocol/node"

const env = await environment("demo")
const ecp = await env.init()
const server = createEcpMcpServer({ ecp })
await serveStdio({ ecp })
```

See [`AGENTS.md`](../../AGENTS.md) and [`ecp-overhaul.md`](../../ecp-overhaul.md) §13 for architecture.
