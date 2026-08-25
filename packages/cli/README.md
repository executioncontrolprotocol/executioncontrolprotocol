# @executioncontrolprotocol/cli

ECP command-line interface for running **workflows** (`@executioncontrolprotocol.workflow`) in configured
**environments** (runtime + extensions + policies).

This CLI is how you run ECP deterministically in a Node.js / TypeScript ecosystem:

- Compile workflow source modules (`.ts` / `.js`) to portable JSON manifests
- Validate workflows against an environment’s registered capabilities
- Describe/search environment capabilities for agent/UI discovery
- Run workflows and print structured run results
- Invoke a single capability outside a workflow (`ecp invoke`)
- Serve an environment over loopback HTTP for `POST /v1/invoke` (`ecp serve`)
- Test workflows with a persistent session (`ecp test start|run|rerun|status`)
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

### Test session (`ecp test`)

Drive a workflow incrementally with frozen state (distinct from `@executioncontrolprotocol/core/testing` stubs):

```sh
ecp test start workflow.ts --env environment.ts -o session.json
ecp test run --to step-b --env environment.ts --session session.json
ecp test rerun step-a --env environment.ts --session session.json
ecp test status --session session.json
```

- `run --to <step-id>` is **inclusive** (runs through that step, then pauses).
- `rerun <step-id>` re-executes one step and **clears** downstream history and `.as` state keys.
- Session file schema: `@executioncontrolprotocol.test.session`.

Fluent API: `ecp.test(workflow).with({ input }).start()` then `session.runTo(id)` / `session.rerun(id)`.

### Invoke a capability

Call a single bound capability without a workflow:

```sh
ecp invoke @executioncontrolprotocol/test.echo --env examples/01-echo/environment.ts --input input.json
```

Optional `--uses <provider-capability-id>` overrides the harness default provider. Prints an `InvokeResult` JSON document; exits non-zero when `success` is false.

### Serve (`ecp serve`)

Expose any `--env` over loopback HTTP (no auth; loopback-only trust):

```sh
ecp serve --env examples/01-echo/environment.ts
ecp serve --env environment.ts --port 3090 --cors-origin http://localhost:5173
```

- `GET /health` — `{ ok, version }`
- `POST /v1/invoke` — body `{ capability, input?, provider? }` → `ecp.invoke(...).with(...).process()`

Default port **3090** (ECP leet), host `127.0.0.1`.

### Local daemon (`ecp up`)

Ollama/PNA **demo bridge** (fixed local env, not arbitrary `--env`). Prefer `ecp serve` for general HTTP invoke. Start the daemon, then open the demo with a pairing token:

```sh
ecp up
# Opens https://demo.executioncontrolprotocol.io/?token=<uuid>&bridge=http://127.0.0.1:3090

ecp up --open-url http://localhost:5173/
ecp up --no-open
```

- `GET /health` — `{ ok, version, ollamaReachable }` (no auth; used by the demo to enable Ollama)
- `POST /v1/invoke` — Bearer token required; same body shape as `ecp serve`

Default port **3090**. The demo reads `?token=` (and optional `?bridge=`) automatically. Hosted HTTPS demos need **Chromium** (Chrome/Edge) for Private Network Access. Add extra page origins with `--cors-origin`.

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
