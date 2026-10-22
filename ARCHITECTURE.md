# ECP Architecture (current)

This repository implements ECP as a **TypeScript-first workflow authoring and
execution protocol**.

**Source of truth during the CLI reset:** [`RESET-PLAN.md`](RESET-PLAN.md)  
**Monorepo guide:** [`AGENTS.md`](AGENTS.md)

------------------------------------------------------------------------

## Core separation

ECP is built around a strict separation:

- **Workflow**: portable execution graph (`@executioncontrolprotocol.workflow`, version `"1.0"`)
- **Environment**: configured container that executes workflows (runtime +
  extensions + policies)
- **Run**: execution of a workflow manifest inside an environment

Rule:

> **Workflow manifests are portable. They do not contain runtime config, extension config, policy config, secrets, or host wiring.**

------------------------------------------------------------------------

## Definitions, bindings, invocations

ECP uses three layers of composition:

- **Definition**: declares reusable implementation/contract  
  `defineExtension(...)`, `defineRuntime(...)`, `definePolicy(...)`
- **Binding**: configures a definition inside an environment  
  `extension("@executioncontrolprotocol/test").with({ ... })`, `runtime("@executioncontrolprotocol/node").with({ ... })`
- **Invocation**: calls a capability from inside a workflow  
  `step("@executioncontrolprotocol/test.echo").with(input).as("echo")`

------------------------------------------------------------------------

## Registry + catalog model

At runtime, ECP resolves everything through a registry:

- **extensions** register capabilities and lifecycle hooks
- **policies** register governance hooks (`policy:pre` / `policy:post` / `policy:finally`)
- **runtimes** provide an executor that runs the workflow graph and emits lifecycle

Extension packages “self-catalog” at module load (e.g. `catalogExtension(def)`).
Environments bind extensions by id (string) after importing the package so its
definitions are available.

Key boundary:

> **Extensions never import hosts.** Extension packages depend on `@executioncontrolprotocol/types` +
> `@executioncontrolprotocol/core` only. Host packages (`@executioncontrolprotocol/node`, `@executioncontrolprotocol/browser`) wrap core.

------------------------------------------------------------------------

## Execution lifecycle (public)

Only these public lifecycle scopes are stable:

- `run:*`
- `step:*`
- `policy:*`

Policies can:

- **allow**: continue
- **deny**: block execution
- **pause**: require approval/human gating
- **modify**: apply modifications (within policy constraints)

------------------------------------------------------------------------

## Package architecture (at a glance)

- `@executioncontrolprotocol/types`: protocol types + JSON Schema artifacts
- `@executioncontrolprotocol/core`: runtime-agnostic fluent API + environment + local engine
- `@executioncontrolprotocol/core/compile` / `core/browser`: host-specific **compile** (Node esbuild vs browser esbuild-wasm) — not part of the runtime host packages
- `@executioncontrolprotocol/node`: Node runtime host
- `@executioncontrolprotocol/browser`: browser runtime host
- `@executioncontrolprotocol/extensions/*`: protocol/platform first-party extensions (formats, secrets, model providers) — written like third-party extensions
- Vendor extensions (`fal`, `image-sharp`, `adobe`, …)
- `@executioncontrolprotocol/policies`: standard policies (budget, approval, state-control, registry-control)
- `@executioncontrolprotocol/mcp`: MCP adapter exposing an environment to agents
- `@executioncontrolprotocol/cli`: CLI for compile/validate/describe/search/run/invoke/test

------------------------------------------------------------------------

## Compile portability

Apps share `compileWorkflowSource`. Implementations live on core subpaths so extensions never import runtime hosts. Swap host by resolving `core/compile` (Node) vs `core/browser` (or the `"browser"` export condition). Phase 2 moves host compile into the environment packages.
