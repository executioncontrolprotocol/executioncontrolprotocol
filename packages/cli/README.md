# @executioncontrolprotocol/cli

ECP (Execution Control Protocol) command-line interface. An oclif 5 host whose own commands
are `defineOperation` definitions compiled by `@executioncontrolprotocol/plugin-sdk`. Plugin
commands come from extension definitions; there are no hand-written command classes.

This CLI is how you run ECP deterministically in a Node.js / TypeScript ecosystem:

- Compile workflow files (`*.ecp.ts` / `.js`) to portable JSON manifests
- Validate workflows against the process host (optional `--config` for machine settings)
- Describe/search environment capabilities for agent/UI discovery
- Run workflows and print structured run results (`ecp run --to`, `ecp run --events`)
- Invoke a single capability outside a workflow (`ecp environments invoke`)
- Inspect and continue run journals (`ecp runs list|show|resume|rerun`)
- Install inferred plugins for a workflow file (`ecp workflows install`)
- Author and check plugins (`ecp plugins new|build|check`) next to oclif's `plugins install|link`
- Encode/decode on `Ecp` after `init()` (the CLI `encode`/`decode` commands were removed in Phase 1)

For the architecture and monorepo package boundaries, start with
[`AGENTS.md`](../../AGENTS.md) and [`RESET-PLAN.md`](../../RESET-PLAN.md).

## Install

From npm (`latest`):

```sh
npm install -g @executioncontrolprotocol/cli
```

The field-test is **0.51.0** (not 1.0). Until that version is on the registry,
pack-install from this repo (`pnpm run test:plugin-pack`).

From this monorepo (recommended for development):

```sh
pnpm install
pnpm run build
cd packages/cli
pnpm link --global
```

## Usage

`--config <file>` is optional machine settings (`config().with([...])`). Omit it to use the
process host (built-in Node plus installed plugins), merging `~/.ecp/config/config.ecp.ts`
when that file exists.

### Run

```sh
ecp plugins link plugins/plugin-test
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
ecp workflows validate examples/01-echo/workflow.ecp.ts
```

### Compile (portable JSON)

```sh
ecp workflows compile examples/01-echo/workflow.ecp.ts -o dist/workflow.json
```

### Describe / search environment capabilities

```sh
ecp environments describe
ecp environments search "echo"
```

### Run journals (`ecp runs`)

Every `ecp run` writes `.ecp/runs/<runId>/` (`run.json` plus `steps/<stepId>.json`). Override
the directory with `ECP_RUNS_DIR`.

```sh
ecp run workflow.ecp.ts --to step-b
ecp runs list
ecp runs show <id>
ecp runs resume <id>
ecp runs resume <id> --approve
ecp runs rerun <id> --from step-a --to step-a
```

- `ecp run --to <step-id>` is **inclusive** (runs through that step, then stops with status
  `stopped`).
- `runs resume` continues a `stopped` or `paused` run as a new run id.
- `runs rerun --from <step>` re-executes from that step using the current file; `--from X --to X`
  re-runs exactly one step and clears later outputs.
- `runs resume --approve` records `{ stepId, approvedBy, at }` for a policy-paused step.

### Invoke a capability

Call a single bound capability without a workflow:

```sh
ecp environments invoke @executioncontrolprotocol/test.echo --input input.json
```

Prints an `InvokeResult` JSON document; exits non-zero when `success` is false.

Pass `--json` for `{ ok: true, data }` or `{ ok: false, error: { code, message, path, suggestions } }`.

### Plugins

```sh
ecp plugins new my-transform
ecp plugins build
ecp plugins check
ecp plugins link plugins/plugin-jsonata
ecp plugins link plugins/plugin-test
ecp jsonata transform --expression '$.a' --input payload.json --json
ecp plugins discover jsonata --json
```

`--config` is optional on `run`, `workflows validate`, and `workflows install`.
`environments describe`, `search`, and `invoke` take it the same way.

### MCP

`ecp mcp serve` is a JIT plugin (`@executioncontrolprotocol/mcp`). The CLI pin is
`^0.51`. Until that version is on the registry, link the workspace package:

```sh
ecp plugins link packages/mcp
ecp mcp serve
ecp mcp serve --http
```

### App

`ecp app` is a JIT plugin (`@executioncontrolprotocol/plugin-app`). The CLI pin is
`^0.51`. Until that version is on the registry, link the workspace package:

```sh
ecp plugins link plugins/plugin-app
ecp app examples/01-echo/workflow.ecp.ts
ecp app brief.ecp.ts --no-open
```

## Related packages

- [`@executioncontrolprotocol/core`](../core/README.md): host-agnostic core + fluent API
- [`@executioncontrolprotocol/plugin-sdk`](../plugin-sdk/README.md): command generation and plugin build library
- [`@executioncontrolprotocol/node`](../environments/node/README.md): Node environment used by CLI examples
- [`@executioncontrolprotocol/core/types`](../core/README.md): protocol types + generated JSON Schemas
- [`@executioncontrolprotocol/mcp`](../mcp/): MCP server adapter exposing an environment to agents
- [`@executioncontrolprotocol/plugin-jsonata`](../../plugins/plugin-jsonata/README.md): reference plugin
- [`@executioncontrolprotocol/plugin-test`](../../plugins/plugin-test/README.md): stub echo capabilities (not a Node default)
