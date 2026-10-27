# Execution Control Protocol (ECP)

[![CI](https://github.com/executioncontrolprotocol/executioncontrolprotocol/actions/workflows/ci.yml/badge.svg)](https://github.com/executioncontrolprotocol/executioncontrolprotocol/actions/workflows/ci.yml)

> **The runtime specification for agentic systems.**

Execution Control Protocol (ECP) is an open standard and reference implementation
for defining, packaging, versioning, and running **portable deterministic and semi-deterministic workflow execution environments for AI agents, built by agents** in
**governed execution environments**.

ECP is designed to **embrace and extend** the Model Context Protocol
(MCP) — not replace it.

-   **MCP** standardizes how models call tools.
-   **ECP** standardizes how agents, tools, context, and policies execute together.

Think of ECP as:

-   Docker Compose for MCP tools
-   Infrastructure-as-code for agent execution environments
-   The missing layer between tool calling (MCP) and multi-agent systems

------------------------------------------------------------------------

## Getting Started

**Prerequisites:** Node.js 22+, pnpm (`corepack enable`). For OpenAI: set `OPENAI_API_KEY`. For Ollama: [install Ollama](https://ollama.com/) and run it locally.

```bash
git clone https://github.com/executioncontrolprotocol/executioncontrolprotocol.git
cd executioncontrolprotocol
corepack enable
pnpm install
pnpm run build
```

**Install the CLI (monorepo dev):** from `packages/cli/` after `pnpm run build`, run `pnpm link --global`.

**Install the CLI (published):** `npm install -g @executioncontrolprotocol/cli`

**Agent skill (monorepo work):** `npx skills add executioncontrolprotocol/executioncontrolprotocol --skill ecp-core -y`  
Consumer skill: `npx skills add https://executioncontrolprotocol.io`

**Run an example** (from the repo root):

```bash
ecp run examples/01-echo/workflow.ecp.ts
```

**Validate a workflow against an environment:**

```bash
ecp workflows validate examples/01-echo/workflow.ecp.ts
```

**Monorepo guide (commands + package boundaries):** [`AGENTS.md`](AGENTS.md)  
**Reset plan (source of truth during the CLI reset):** [`RESET-PLAN.md`](RESET-PLAN.md)  
**Docs:** [https://executioncontrolprotocol.io/](https://executioncontrolprotocol.io/)

## Why ECP Exists

There is a gap in the stack:

| Layer     | Standard      |
| --------- | ------------- |
| Models    | API providers |
| Tools     | MCP           |
| Agents    | Frameworks    |
| Execution | **Missing**   |

**ECP fills the execution layer.**

If MCP standardizes how AI systems **call tools**, ECP standardizes how AI systems **run**.

------------------------------------------------------------------------

## The Problem

AI agents are moving from prototypes to production systems.

When agents operate across real systems they create new challenges:

-   Tool permissions become unclear
-   Agent actions are difficult to audit
-   Context sources are inconsistent
-   Execution environments are not reproducible
-   Automation workflows become fragile
-   Governance and compliance are difficult to enforce

Today, these concerns are handled with **custom orchestration code**.

There is no standard way to define how AI agents execute in production environments.

ECP provides that missing execution layer.

------------------------------------------------------------------------

## Why ECP?

Today:

-   AI tools live inside chat windows.
-   Agents are embedded inside single apps.
-   Cross-system automations are brittle workflows.
-   Permissions are unclear.
-   Configurations are not portable.

ECP introduces a portable, versioned object called a **Workflow** (executed inside
an **Environment**).

An Environment defines the governed execution container for an agent/system:

-   What MCP servers are available
-   What tools are allowed
-   What data sources are mounted
-   What canonical object types are expected
-   What triggers invoke the agent
-   What outputs are allowed
-   What runtime constraints and guardrails apply

ECP enables:

-   Shareable execution environments
-   Verticalized environments (e.g., Shopify Ops Environment, RevOps Environment)
-   Reusable workflow libraries
-   Safe, inspectable cross-system AI execution

------------------------------------------------------------------------

## Relationship to Model Context Protocol (MCP)

ECP builds directly on the Model Context Protocol.

MCP Overview:
https://modelcontextprotocol.io/

MCP Specification:
https://modelcontextprotocol.io/specification/2026-07-28

MCP standardizes:

-   Tool discovery
-   Tool invocation
-   Structured tool outputs

ECP **does not redefine tool calling**.

Instead, ECP:

-   References MCP servers
-   References MCP tool names
-   Uses structured argument schemas
-   Bundles permissions and policies
-   Adds versioning and packaging semantics

If MCP is the "USB interface" for AI tools, ECP is the "container
manifest" that defines the whole execution environment.

------------------------------------------------------------------------

## Conceptual Architecture

ECP is not just a spec — it defines an **execution environment**.

```text
Compute
    ↓
Models
    ↓
MCP (tool interface)
    ↓
ECP (execution environment specification)
    ↓
ECP Runtime (execution engine)
    ↓
Applications
```

**ECP spec + runtime = system.**

------------------------------------------------------------------------

## Core Concepts

### Workflow

A portable execution graph (schema: `@executioncontrolprotocol.workflow`, version: `"1.0"`).

Workflows do **not** contain runtime config, extension config, policy config, or secrets.

------------------------------------------------------------------------

### Environment

A configured execution container that binds extensions, policies, and
secret sources, then executes workflows deterministically under governance.

------------------------------------------------------------------------

### Execution

A single execution of a workflow manifest inside an environment.

Includes:

-   Resolved context snapshot
-   Tool calls
-   Outputs
-   Audit logs

------------------------------------------------------------------------

### Execution Trace

A deterministic record of an execution including:

-   The resolved Context snapshot
-   Executor graph
-   Tool invocations
-   Outputs
-   Policy decisions
-   Timing information

Execution traces enable:

-   Debugging
-   Replay
-   Auditing
-   Compliance reporting

------------------------------------------------------------------------

## Security Principles

ECP is designed with secure-by-default principles inspired by real-world
autonomous agent deployments.

Defaults:

-   Default-deny tool access
-   Scoped permissions (read / write / admin)
-   Write barriers (approval required by default)
-   Runtime budgets (tool calls, cost, time)
-   Provenance tracking of context sources
-   Signed and versioned contexts
-   Short-lived credentials
-   Full audit logging

Every execution should produce a **reproducible trace** including:

-   Resolved context snapshot
-   Tool invocation log
-   Agent outputs
-   Execution timeline
-   Policy decisions

This supports compliance, debugging, and replay.

Contexts must make overly-permissive configurations difficult to express
and difficult to distribute.

------------------------------------------------------------------------

## ECP vs Workflow Automation

Tools like Zapier, n8n, and Make connect APIs using **predefined workflows**.

ECP solves a different problem.

ECP is designed for **agent-driven execution**, where systems:

-   Plan actions dynamically
-   Call tools conditionally
-   Access context at runtime
-   Require governance and auditability

Instead of defining **fixed workflows**, ECP defines **execution environments for intelligent agents**.

------------------------------------------------------------------------

## Workflow Hello World

The smallest runnable workflow in this repo is the echo example:

```bash
ecp run examples/01-echo/workflow.ecp.ts
```

The canonical artifact is the JSON workflow manifest (`@executioncontrolprotocol.workflow`), even when
you author in TypeScript via the Fluent API.

------------------------------------------------------------------------

## Repository Structure

This repo is the **ECP Fluent API monorepo** (`@executioncontrolprotocol/*`). For commands, package boundaries, and extension rules, start with [`AGENTS.md`](AGENTS.md).

| Path | Description |
| ---- | ----------- |
| [`packages/core/`](packages/core/) | Runtime-agnostic core: fluent API, environment, encode/decode/patch, protocol types (`@executioncontrolprotocol/core`, `@executioncontrolprotocol/core/types`) |
| [`packages/environments/node/`](packages/environments/node/) | Node runtime host: process env, secrets, compile (`@executioncontrolprotocol/node`) |
| [`packages/environments/browser/`](packages/environments/browser/) | Browser runtime host: registry, local config (`@executioncontrolprotocol/browser`) |
| [`packages/cli/`](packages/cli/) | CLI (`ecp run`, `ecp workflows`, `ecp environments`, `ecp runs`, …) |
| [`plugins/`](plugins/) | First-party plugins (jsonata, models, formats, policies, fal, image-sharp, azure-blob-storage, adobe-firefly-services) |
| [`packages/mcp/`](packages/mcp/) | MCP server adapter |
| [`examples/`](examples/) | Single-file `*.ecp.ts` workflows (`01-echo`, `02-weekly-brief`, …) |
| [`RESET-PLAN.md`](RESET-PLAN.md) | CLI reset plan (source of truth during the milestone) |

------------------------------------------------------------------------

## What ECP Is NOT

ECP is not:

-   An agent framework
-   A workflow builder
-   A chat interface
-   A document tool
-   A BI dashboard
-   A replacement for MCP

ECP is:

-   An **execution layer** — not an agent SDK
-   A packaging format for execution environments
-   A governance layer for AI tool access
-   A portable artifact that can be shared and versioned
-   An open specification for cross-system AI operations

------------------------------------------------------------------------

## Open Core Model

The ECP **specification** is open.

Anyone can:

-   Implement runtimes
-   Create contexts
-   Build tooling

Commercial platforms may provide:

-   Managed execution runtimes
-   Execution tracing and observability
-   Credential vaults
-   Approval workflows
-   Context registries
-   Policy management

This model mirrors successful infrastructure ecosystems such as Docker, Kubernetes, and Terraform.

------------------------------------------------------------------------

## Roadmap

v0.1 Goals:

-   Minimal, implementable manifest
-   MCP-aligned semantics
-   Default-deny security posture
-   Versioned Contexts
-   Parameterization
-   Trigger support
-   Tool allowlists

Future (spec and runtime):

-   Execution tracing standard
-   Context registry specification
-   Policy engine model
-   Runtime observability
-   Multi-agent orchestration primitives
-   Context hydration stages
-   Signed contexts
-   Canonical object schema registry

------------------------------------------------------------------------

## Vision

As AI agents become responsible for real-world operations, they require the same infrastructure that traditional distributed systems rely on.

ECP aims to provide the execution layer for agentic systems:

-   Portable execution environments
-   Governed tool access
-   Reproducible executions
-   Inspectable decision traces

If MCP standardizes how AI systems **call tools**, ECP standardizes how AI systems **run**.

------------------------------------------------------------------------

## Get Involved

We welcome:

-   Spec feedback
-   Runtime implementations
-   Context examples
-   Security reviews
-   MCP compatibility testing

Let's build the execution layer for agentic systems.
