# ECP Architecture (current)

This repository implements ECP as a **TypeScript-first workflow authoring and
execution protocol**.

**Source of truth:** [`ecp-overhaul.md`](ecp-overhaul.md)  
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
  `extension("@executioncontrolprotocol/memory").with({ ... })`, `runtime("@executioncontrolprotocol/local").with({ ... })`
- **Invocation**: calls a capability from inside a workflow  
  `step("@executioncontrolprotocol/memory.search").with(input).as("signals")`

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
- `@executioncontrolprotocol/node`: Node runtime host
- `@executioncontrolprotocol/browser`: browser runtime host (not the demo UI)
- `@executioncontrolprotocol/extensions/*`: first-party extensions (written like third-party extensions)
- `@executioncontrolprotocol/policies`: standard policies (budget, approval, state-control)
- `@executioncontrolprotocol/mcp`: MCP adapter exposing an environment to agents
- `@executioncontrolprotocol/cli`: CLI for compile/validate/describe/search/run/encode/decode
- `@executioncontrolprotocol/harnesses-browser-nano`: harness tasks used by demo + evals
- `@executioncontrolprotocol/evals` (private): harness/provider eval fixtures + matrix tests
- [executioncontrolprotocol-browser-demo](https://github.com/GuillaumeCleme/executioncontrolprotocol-browser-demo): reference UI app using the browser runtime + harnesses

------------------------------------------------------------------------

## Harnesses vs evals

- **Harnesses** define how ECP calls models/providers to author/repair/assist with
  ECP artifacts (prompts, repair loop, decode/validation feedback).
- **Evals** are fixture-driven tests that hold harnesses accountable across
  provider profiles.

Harnesses should not own fixtures; evals should not re-implement harness logic.
