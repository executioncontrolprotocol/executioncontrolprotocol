# Spec: Execution Control Protocol (ECP) — v1 (current)

This repository currently implements ECP as a **TypeScript-first workflow authoring
and execution protocol**.

**Source of truth during the CLI reset:** [`RESET-PLAN.md`](RESET-PLAN.md)  
**Monorepo guide:** [`AGENTS.md`](AGENTS.md)  
**Types:** [`packages/core/src/types`](packages/core/src/types) (`@executioncontrolprotocol/core/types`)

> **Rule 1:** Workflows are portable execution graphs. Environments execute workflows.

------------------------------------------------------------------------

## Relationship to MCP

- **MCP** standardizes tool discovery + invocation.
- **ECP** standardizes how workflows run in governed environments that bind tools,
  models, policies, and runtimes together.

ECP does not redefine tool calling; it **hosts** and **governs** it via runtimes,
extensions, and policies.

------------------------------------------------------------------------

## Core object model (v1)

ECP v1 separates **definitions** from **bindings**, and **environments** from
**workflows**:

- **Definitions**: runtimes, extensions, policies, capabilities, hooks
- **Bindings**: configured instances of definitions inside an environment
- **Workflow**: portable execution graph (`@executioncontrolprotocol.workflow`, version `"1.0"`)
- **Environment**: configured container that executes workflows (`@executioncontrolprotocol.environment`, version `"1.0"`)
- **Run**: execution of a workflow inside an environment (`@executioncontrolprotocol.run.*`)

In the fluent API:

- **Definition**: `defineExtension(...)`, `defineEnvironment(...)`, `definePolicy(...)`
- **Binding**: `extension(definition).with({ ... })`, `policy(definition).with({ ... })`
- **Invocation**: `step("@executioncontrolprotocol/x.do").with(input).as("key")`

------------------------------------------------------------------------

## Workflow manifests

A workflow manifest is the canonical serialized artifact.

- **Schema**: `@executioncontrolprotocol.workflow`
- **Version**: `"1.0"`
- **Content**: steps (including `parallel` / `branch` / `loop`) and optional flow conditions

Workflows do **not** contain:

- runtime configuration
- extension configuration
- policy configuration
- secrets
- host wiring

Workflows are authored in TypeScript via `@executioncontrolprotocol/core` but compile to JSON for
portability and deterministic review.

------------------------------------------------------------------------

## Environments (bindings + governance)

An environment binds the non-portable parts:

- **executor**: host engine + lifecycle emission
- **extensions**: capabilities and lifecycle hooks
- **policies**: governance (`policy:pre` / `policy:post` / `policy:finally`)

Environments are responsible for:

- capability registration + resolution
- validation (`environment.validate(workflow)`)
- discovery (`environment.describe()` / `environment.search()`)
- execution (`environment.run(workflow)`)

Operational APIs live on `Ecp` after `await env.init()`.

------------------------------------------------------------------------

## Policies

Policies are **first-class** and govern execution:

- `policy:pre`: allow/deny/pause/modify before step execution
- `policy:post`: validate outputs + staged mutations
- `policy:finally`: cleanup, usage reporting, audit finalization

This repository includes `@executioncontrolprotocol/policies` for standard budget/approval/state-control
policies.

------------------------------------------------------------------------

## Extensions

Extensions are the primary way to add capabilities and hooks.

Key rules:

- extensions depend on `@executioncontrolprotocol/core` and `@executioncontrolprotocol/core/types` only
- extensions must not import host packages (`@executioncontrolprotocol/node`, `@executioncontrolprotocol/browser`, CLI, MCP)
- first-party protocol/platform extensions under `packages/extensions/*` follow the same rules as
  third-party extensions (“dogfooding”); vendor packages live in `extensions`

------------------------------------------------------------------------

## Environment hosts

Environment packages wrap core with host I/O:

- `@executioncontrolprotocol/node`: Node environment (file I/O, compile, OS secrets, process-env)
- `@executioncontrolprotocol/browser`: Browser environment (registry/session config, esbuild-wasm compile; not the demo UI)

Core remains host-agnostic; exports are `.` and `./types` only.

------------------------------------------------------------------------

## Harnesses vs evals

- **Harnesses** define how we invoke models/providers to author, repair, validate,
  and assist with ECP artifacts. Harnesses do not own fixture sets.
- **Evals** contain fixture-driven tests for harness behavior across provider
  profiles (e.g. pinned Ollama model, Chrome Nano).

------------------------------------------------------------------------

## CLI and MCP adapter

- **CLI** (`@executioncontrolprotocol/cli`): compile, validate, describe, search, run, serve MCP.
- **MCP adapter** (`@executioncontrolprotocol/mcp`): exposes environment APIs as MCP tools/resources/prompts
  for agent integration.

------------------------------------------------------------------------

## Legacy spec note

Earlier iterations used **Context YAML** manifests and “plugins” terminology. That
legacy implementation and documentation is archived under
[`archive/legacy-v0.5/`](archive/legacy-v0.5/).
