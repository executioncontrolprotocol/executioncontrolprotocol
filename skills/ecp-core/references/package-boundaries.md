# Package boundaries (realignment)

Package names and directories for the new code are confirmed in Phase 1. The boundaries below
are decided (see `REALIGNMENT-PLAN.md`).

## Target components

| Component | Owns | Must not |
| --- | --- | --- |
| Core (engine) | Execution manifest v2 types and validation, executor, registry (from plugin manifests), service container (`defineService`, `use`, `get`), `$ref`/`$state`/`$expr`/`$script` resolution | Do I/O directly; everything external goes through services |
| Services (implementations) | `PluginAdapter` (in-process, lazy), `StorageProvider` (`localstorage`), `SecretsProvider` (env/keychain), `ExpressionEngine` (QuickJS-WASM), `Formatter` (json, toon), `Endpoint` (HTTP API), `Auth` (local token) | Run inside an execution |
| ECP host | One restartable process: engine + services + loaded plugins + HTTP API (`/retrieve`, `/execute`, `/commit`, `/watch`, `/health`) | Evaluate JS outside QuickJS; branch on capability ids |
| Host supervisor | `~/.ecp/host.json`, start/drain/restart, same port across restarts | Run capabilities |
| MCP relay | Three tools (`retrieve`, `execute`, `commit`) forwarded to the host API | Run capabilities, own storage, change its tool list |
| CLI | oclif: `ecp mcp start`, `ecp app`, `ecp retrieve/execute/commit`, `ecp plugins …`, `ecp secrets …`, `ecp host …` (as decided) | Per-capability commands |
| App | React UI served by the host API; graph and run status | Write files directly (goes through `commit`) |
| Plugin authoring package | Capability definition, config schema, `ecp.manifest.json` generation | Import host, CLI, relay or App |
| Plugins | Capabilities only | Import host, CLI, relay or App; mark config fields as secret |

## Legacy packages

| Package | Becomes |
| --- | --- |
| `packages/core` | Reference for core (manifest types, executor routing, resolution, commit modes, validation, Fluent builder) |
| `packages/environments/node` | Reference for the keychain `SecretsProvider` and run records |
| `packages/environments/browser` | Out of scope |
| `packages/cli` | Reference for oclif plugin management |
| `packages/plugin-sdk` | Reference; command generation is dropped |
| `packages/mcp` | Replaced by the MCP relay |
| `packages/app`, `plugins/plugin-app` | Reference for the App (graph mapping, run overlay) |
| `plugins/plugin-format-*` | `Formatter` implementations |
| `plugins/plugin-budget`, `plugin-approval`, `plugin-state-control` | Out of scope (policies) |
| Other `plugins/plugin-*` | Ported to the new plugin API, test/anthropic/firefly/azure-blob first |

Legacy packages are reference code: read them, don't extend them, delete each in the PR that
replaces it.
