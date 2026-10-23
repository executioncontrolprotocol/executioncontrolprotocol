# @executioncontrolprotocol/cli

ECP (Execution Control Protocol) command-line interface. An oclif 5 host whose own commands
are `defineOperation` definitions compiled by `@executioncontrolprotocol/plugin-sdk`. Plugin
commands come from extension definitions; there are no hand-written command classes.

This CLI is how you run ECP deterministically in a Node.js / TypeScript ecosystem:

- Compile workflow files (`*.ecp.ts` / `.js`) to portable JSON manifests
- Validate workflows against the process host or an optional `--env` overlay
- Describe/search environment capabilities for agent/UI discovery
- Run workflows and print structured run results
- Invoke a single capability outside a workflow (`ecp invoke`)
- Test workflows with a persistent session (`ecp test start|run|rerun|status`; Phase 4 PR 2 replaces this with `ecp runs *`)
- Install inferred plugins for a workflow file (`ecp install`)
- Author and check plugins (`ecp plugins new|build|check`) next to oclif's `plugins install|link`
- Encode/decode on `Ecp` after `init()` (the CLI `encode`/`decode` commands were removed in Phase 1)

For the architecture and monorepo package boundaries, start with
[`AGENTS.md`](../../AGENTS.md) and [`RESET-PLAN.md`](../../RESET-PLAN.md).

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

`--env <file>` is an optional overlay (`environment(id).with([...])`). Omit it to use the
process host (built-in Node plus installed plugins).

### Run

```sh
ecp run examples/01-echo/workflow.ecp.ts
```

Provide workflow input (JSON file):

```sh
ecp run workflow.ecp.ts --input input.json
```

Dry run (validate + plan without invoking capabilities):

```sh
ecp run workflow.ecp.ts --dry-run
```

### Validate

```sh
ecp validate examples/01-echo/workflow.ecp.ts
```

### Compile (portable JSON)

```sh
ecp compile examples/01-echo/workflow.ecp.ts -o dist/workflow.json
```

### Describe / search environment capabilities

```sh
ecp describe
ecp search "echo"
```

### Test session (`ecp test`)

Drive a workflow incrementally with frozen state (distinct from `testExtension` stubs):

```sh
ecp test start workflow.ecp.ts -o session.json
ecp test run --to step-b --session session.json
ecp test rerun step-a --session session.json
ecp test status --session session.json
```

- `run --to <step-id>` is **inclusive** (runs through that step, then pauses).
- `rerun <step-id>` re-executes one step and **clears** downstream history and `.as` state keys.
- Session file schema: `@executioncontrolprotocol.test.session`.

Fluent API: `ecp.test(workflow).with({ input }).start()` then `session.runTo(id)` / `session.rerun(id)`.

### Invoke a capability

Call a single bound capability without a workflow:

```sh
ecp invoke @executioncontrolprotocol/test.echo --input input.json
```

Prints an `InvokeResult` JSON document; exits non-zero when `success` is false.

Pass `--json` for `{ ok: true, data }` or `{ ok: false, error: { code, message, path, suggestions } }`.

### Plugins

```sh
ecp plugins new my-transform
ecp plugins build
ecp plugins check
ecp plugins link plugins/plugin-jsonata
ecp jsonata transform --expression '$.a' --input payload.json --json
ecp discover jsonata --json
```

`--env` is optional on `run`, `validate`, `install`, and `ecp test *`. `describe`, `search`,
and `invoke` take it the same way. Phase 4 PR 2 replaces `ecp test` with `ecp runs *`.

## Related packages

- [`@executioncontrolprotocol/core`](../core/README.md): host-agnostic core + fluent API
- [`@executioncontrolprotocol/plugin-sdk`](../plugin-sdk/README.md): command generation and plugin build library
- [`@executioncontrolprotocol/node`](../environments/node/README.md): Node environment used by CLI examples
- [`@executioncontrolprotocol/core/types`](../core/README.md): protocol types + generated JSON Schemas
- [`@executioncontrolprotocol/mcp`](../mcp/): MCP server adapter exposing an environment to agents
- [`@executioncontrolprotocol/plugin-jsonata`](../../plugins/plugin-jsonata/README.md): reference plugin
