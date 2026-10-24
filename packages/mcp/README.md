# `@executioncontrolprotocol/mcp`

MCP (Model Context Protocol) adapter that exposes an initialized ECP host as tools
and resources. The same package is the JIT CLI plugin behind `ecp mcp serve`.

## Library

```ts
import { createEcpMcpServer, toMcpTools } from "@executioncontrolprotocol/mcp"
import { getHost } from "@executioncontrolprotocol/plugin-sdk"

const host = getHost()
const tools = toMcpTools(host.registry)
const server = createEcpMcpServer({ host })
```

`createEcpMcpServer({ host })` takes the process host the CLI `init` hook stores, not a
bare `Ecp`. Capability tools are generated from the registry (`jsonata_transform`); there
is no per-capability MCP code. Format plugins show up as capability tools
(`format_toon_encode`), not root `encode` / `decode` tools.

## CLI

```sh
ecp mcp serve
ecp mcp serve --tools meta
```

stdio is the default. Streamable HTTP, `list_changed`, and run-progress notifications
ship in the next Phase 7 PR. Until `@next` is on the registry, install from the workspace
with `ecp plugins link packages/mcp` (or a packed tarball plus `ECP_ALLOW_SOURCE=path`).

## Meta tools

| Tool | Does |
| --- | --- |
| `ecp_search` | Search capabilities |
| `ecp_describe` | Describe the environment (`format` for `toon`) |
| `ecp_validate` | Validate a workflow `path` or Fluent `source` |
| `ecp_run` | Run a workflow `path` or `source`; returns `runId` |
| `ecp_runs_show` | Show a journal |
| `ecp_runs_rerun` | Rerun from a step |
| `ecp_invoke` | Invoke one capability |
| `ecp_plugins_install` | Install a plugin (`confirm: true`; trust policy applies) |

`--tools meta` serves only this set. Capabilities are still reachable with `ecp_invoke`.
