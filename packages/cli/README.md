# @executioncontrolprotocol/cli

ECP command-line interface for running **workflows** (`@executioncontrolprotocol.workflow`) in configured
**environments** (runtime + extensions + policies).

This CLI is how you run ECP deterministically in a Node.js / TypeScript ecosystem:

- Compile workflow source modules (`.ts` / `.js`) to portable JSON manifests
- Validate workflows against an environment’s registered capabilities
- Describe/search environment capabilities for agent/UI discovery
- Run workflows and print structured run results
- Encode/decode workflows using format extensions (TOON, Fluent, JSON)

For the architecture and monorepo package boundaries, start with
[`AGENTS.md`](../../AGENTS.md) and [`ecp-overhaul.md`](../../ecp-overhaul.md).

## Install

From npm (when published):

```sh
npm install -g @executioncontrolprotocol/cli
```

From this monorepo (recommended for development):

```sh
npm install
npm run build
cd packages/cli
npm link
```

## Usage

All operational commands that need an environment accept:

- `--env <path>`: a module that exports the environment builder (`default export`)

### Run

```sh
ecp run examples/01-echo/workflow.ts --env examples/01-echo/environment.ts
```

Provide workflow input (JSON file):

```sh
ecp run workflow.json --env environment.ts --input input.json
```

Dry run (validate + plan without invoking capabilities):

```sh
ecp run workflow.ts --env environment.ts --dry-run
```

### Validate

```sh
ecp validate examples/01-echo/workflow.ts --env examples/01-echo/environment.ts
```

### Compile (portable JSON)

```sh
ecp compile examples/01-echo/workflow.ts -o dist/workflow.json
```

### Describe / search environment capabilities

```sh
ecp describe --env examples/01-echo/environment.ts
ecp search "echo" --env examples/01-echo/environment.ts
```

### Encode / decode formats

Encoding and decoding uses **format extensions** bound in your environment.

```sh
ecp encode workflow.json --format toon --env environment.ts -o workflow.toon
ecp encode workflow.json --format fluent --env environment.ts -o workflow.generated.ts
ecp decode workflow.toon --format toon --env environment.ts -o workflow.json
```

Notes:

- Fluent **decode** is not supported. Use `ecp compile` for TypeScript/Fluent source → manifest.
- JSON is the canonical manifest format; other formats are optional extensions.

## Related packages

- [`@executioncontrolprotocol/core`](../core/README.md): runtime-agnostic core + fluent API
- [`@executioncontrolprotocol/node`](../runtimes/node/README.md): Node runtime host used by CLI examples
- [`@executioncontrolprotocol/types`](../types/README.md): protocol types + generated JSON Schemas
- [`@executioncontrolprotocol/mcp`](../mcp/): MCP server adapter exposing an environment to agents
