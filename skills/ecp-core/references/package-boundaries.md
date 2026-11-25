# Package boundaries (MVP)

| Package | May depend on | Must not |
| --- | --- | --- |
| `protocol` | (none of the others) | engine, host, plugins |
| `engine` | `protocol` | host, cli, local I/O |
| `quickjs` | `protocol` | host |
| `local` | `protocol`, `plugin-sdk` (load) | cli, app |
| `formatters` | `protocol` | host |
| `plugin-sdk` | `protocol`, zod | host, cli, app |
| `host` | engine, local, quickjs, formatters, protocol | plugins' SDKs |
| `cli` | host client libs, protocol | plugin business logic |
| `mcp-relay` | protocol, host discovery | plugin business logic |
| `app` | protocol (graph helpers) | plugin SDKs |
| `plugins/*` | `plugin-sdk` (peer), focused libs | host, cli, mcp-relay, app |

Plugins never import hosts. Domain knowledge stays in the plugin, surfaced through metadata and
schemas. Reference plugin: `plugins/plugin-test`.
