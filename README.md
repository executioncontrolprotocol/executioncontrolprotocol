# Execution Control Protocol (ECP)

[![CI](https://github.com/GuillaumeCleme/executioncontextprotocol/actions/workflows/ci.yml/badge.svg)](https://github.com/GuillaumeCleme/executioncontextprotocol/actions/workflows/ci.yml)

> **The runtime specification for agentic systems.**

Execution Control Protocol (ECP) is an open standard for defining,
packaging, versioning, and deploying **execution environments for AI agents** —
portable specifications that describe what an agent can see, what tools it can
access, and how it runs.

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

**Prerequisites:** Node.js 22+, npm or pnpm. For OpenAI: set `OPENAI_API_KEY`. For Ollama: [install Ollama](https://ollama.com/) and run it locally.

```bash
git clone https://github.com/GuillaumeCleme/executioncontextprotocol.git
cd executioncontextprotocol
npm install   # or pnpm install
npm run build
```

**Install the CLI (recommended):** `cd packages/cli && npm link && cd ../..`  
(Or use `npx ecp …` from the repo root after `npm run build`.)

**Run an example:**

```bash
ecp run examples/single-executor/context.yaml --provider ollama --model gemma3:1b -i topic="ECP"
```

**Validate a Context:**

```bash
ecp validate examples/single-executor/context.yaml
```

**Full setup guide:** [SETUP.md](SETUP.md) — global CLI install, Ollama, environment variables, system config (`ecp.config.yaml`), and docs.

------------------------------------------------------------------------

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

ECP introduces a portable, versioned object called a **Context**.

A Context defines the **execution environment** for an AI agent:

-   What MCP servers are available
-   What tools are allowed
-   What data sources are mounted
-   What canonical object types are expected
-   What triggers invoke the agent
-   What outputs are allowed
-   What runtime constraints and guardrails apply

ECP enables:

-   Shareable execution environments
-   Verticalized contexts (e.g., Shopify Ops Context, RevOps Context)
-   Agency-built reusable contexts
-   Safe, inspectable cross-system AI execution

------------------------------------------------------------------------

## Relationship to Model Context Protocol (MCP)

ECP builds directly on the Model Context Protocol.

MCP Overview:
https://modelcontextprotocol.io/

MCP Specification (example schema):
https://modelcontextprotocol.io/docs/specification

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

### Context

A declarative, versioned, parameterized **execution environment** specification for an AI agent.

Equivalent to a Dockerfile + image manifest.

Does not include ephemeral data.

------------------------------------------------------------------------

### Context Instance

A deployed, parameterized installation of a Context.

Equivalent to a Docker container.

Binds:

- Credentials
- Inputs
- Team scope
- Trigger activation

------------------------------------------------------------------------

### Execution

A single execution of an instance in response to a trigger.

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

## ECP v0.1 Example Schema

Included in this repository is an example Context manifest:
[`spec.yaml`](spec.yaml).

See also the [full specification](SPEC.md) and the
[TypeScript type definitions](packages/spec/src/types/ecp.ts).
The extension registration proposal is documented in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

------------------------------------------------------------------------

## Hello World

A minimal Context in under a minute:

```yaml
apiVersion: ecp/v0.3-draft
kind: Context

metadata:
  name: hello-agent
  version: 1.0.0

extensions:
  version: 1.0.0
  providers:
    - name: openai
      kind: model-provider
      type: builtin
      version: 0.3.0
  security: {}

inputs:
  topic:
    type: string
    required: true

outputs:
  - name: summary
    fromSchema: Summary

schemas:
  Summary:
    type: object
    required: [headline, body]
    properties:
      headline: { type: string }
      body: { type: string }

orchestration:
  entrypoint: summarizer
  strategy: single
  produces: Summary

executors:
  - name: summarizer
    type: agent
    model:
      provider: { name: openai, type: builtin, version: 0.3.0 }
      name: gpt-4o-mini
    instructions: Given a topic, produce a JSON object with headline and body.
    outputSchemaRef: "#/schemas/Summary"
```

Run it: `ecp run context.yaml -i topic="AI agents"`

See [`examples/single-executor/context.yaml`](examples/single-executor/context.yaml) for a full runnable example.

------------------------------------------------------------------------

## Repository Structure

| Path | Description |
| ---- | ----------- |
| [`spec.yaml`](spec.yaml) | Canonical example Context manifest |
| [`SPEC.md`](SPEC.md) | Full protocol specification |
| **[`SETUP.md`](SETUP.md)** | **Setup guide: install, CLI (global), env vars, Ollama, system config, docs** |
| [`config/`](config/) | Example system config (`ecp.config.example.yaml`) — allow-list extensions and security; use with `--config` or copy to `./ecp.config.yaml` / `~/.ecp/config.yaml` |
| [`packages/spec/`](packages/spec/) | TypeScript types, JSON Schema, validators |
| [`packages/runtime/`](packages/runtime/) | Execution engine, providers, protocols |
| [`packages/cli/`](packages/cli/) | CLI tool (`ecp run` / `ecp validate`) |
| [`packages/docs/`](packages/docs/) | TypeDoc documentation generator |
| [`examples/`](examples/) | Example Context manifests |
| [`evals/`](evals/) | Evaluation cases and rubrics |

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
