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
  `defineExtension(...)`, `defineEnvironment(...)`, `definePolicy(...)`
- **Binding**: configures a definition inside an environment  
  `extension(testExtension).with({ ... })`, `policy(budgetPolicy).with({ ... })`
- **Invocation**: calls a capability from inside a workflow  
  `step("@executioncontrolprotocol/test.echo").with(input).as("echo")`

------------------------------------------------------------------------

## Registry + catalog model

ECP resolves everything through a per-environment registry:

- **extensions** register capabilities and lifecycle hooks
- **policies** register governance hooks (`policy:pre` / `policy:post` / `policy:finally`)
- **environments** provide an executor that runs the workflow graph and emits lifecycle

Definitions are data. Bind `extension(definition)` / `policy(definition)` on
`environment(id, label?).with([...])`. There is no module-load catalog.

Key boundary:

> **Extensions never import hosts.** Extension packages depend on `@executioncontrolprotocol/core` and
> `@executioncontrolprotocol/core/types` only. Host packages (`@executioncontrolprotocol/node`, `@executioncontrolprotocol/browser`) wrap core.

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

- `@executioncontrolprotocol/core/types`: protocol types + JSON Schema artifacts
- `@executioncontrolprotocol/core`: host-agnostic fluent API + environment + local engine + `registry-control`
- `@executioncontrolprotocol/node`: Node environment (compile, loaders, OS secrets, process-env)
- `@executioncontrolprotocol/browser`: browser environment (registry, local config, esbuild-wasm compile)
- `@executioncontrolprotocol/extensions/*`: protocol/platform first-party extensions (formats, model providers) — written like third-party extensions
- Vendor extensions (`fal`, `image-sharp`, `adobe`, …)
- `@executioncontrolprotocol/policies`: standard policies (budget, approval, state-control)
- `@executioncontrolprotocol/mcp`: MCP adapter exposing an environment to agents
- `@executioncontrolprotocol/cli`: CLI for compile/validate/describe/search/run/invoke/test

------------------------------------------------------------------------

## Compile portability

Apps share `compileWorkflowSource`. Implementations live on the environment packages so core stays host-agnostic: Node esbuild on `@executioncontrolprotocol/node`, esbuild-wasm on `@executioncontrolprotocol/browser`.
