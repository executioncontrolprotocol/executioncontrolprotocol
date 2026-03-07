# Execution Control Protocol (ECP)

[![CI](https://github.com/GuillaumeCleme/executioncontextprotocol/actions/workflows/ci.yml/badge.svg)](https://github.com/GuillaumeCleme/executioncontextprotocol/actions/workflows/ci.yml)
[![Docs](https://github.com/GuillaumeCleme/executioncontextprotocol/actions/workflows/docs.yml/badge.svg)](https://guillaumecleme.github.io/executioncontextprotocol/)

> The control plane for cross-system AI agents.

Execution Control Protocol (ECP) is an open specification for defining,
packaging, versioning, and deploying **agent environments** --- portable
configurations that describe what an AI agent can see, what tools it can
access, and when it runs.

ECP is designed to **embrace and extend** the Model Context Protocol
(MCP) --- not replace it.

-   **MCP** standardizes how models call tools.
-   **ECP** standardizes how tools, context, permissions, and triggers
    are bundled into reusable agent environments.

Think of ECP as:

-   Docker Compose for MCP tools
-   Infrastructure-as-code for AI agent environments
-   The missing layer between tool calling (MCP) and multi-agent systems

------------------------------------------------------------------------

## Why ECP?

Today:

-   AI tools live inside chat windows.
-   Agents are embedded inside single apps.
-   Cross-system automations are brittle workflows.
-   Permissions are unclear.
-   Configurations are not portable.

ECP introduces a portable, versioned object called a **Context**.

A Context defines:

-   What MCP servers are available
-   What tools are allowed
-   What data sources are mounted
-   What canonical object types are expected
-   What triggers invoke the agent
-   What outputs are allowed
-   What runtime constraints and guardrails apply

ECP enables:

-   Shareable agent environments
-   Verticalized contexts (e.g., Shopify Ops Context, RevOps Context)
-   Agency-built reusable environments
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
manifest" that defines the whole operating environment.

------------------------------------------------------------------------

## Conceptual Architecture

Layered stack:

Compute -> Model API -> MCP (Tool Interface) -> ECP (Agent Environment
Spec) -> A2A (Agent Coordination, optional) -> Applications

ECP sits between MCP and application logic.

------------------------------------------------------------------------

## Core Concepts

### Context

A declarative, versioned, parameterized agent environment specification.

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

Contexts must make overly-permissive configurations difficult to express
and difficult to distribute.

------------------------------------------------------------------------

## ECP v0.1 Example Schema

Included in this repository is an example Context manifest:
[`spec.yaml`](spec.yaml).

See also the [full specification](SPEC.md) and the
[TypeScript type definitions](packages/spec/src/types/ecp.ts).
The extension registration proposal is documented in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

------------------------------------------------------------------------

## Repository Structure

| Path | Description |
|---|---|
| [`spec.yaml`](spec.yaml) | Canonical example Context manifest |
| [`SPEC.md`](SPEC.md) | Full protocol specification |
| [`packages/spec/`](packages/spec/) | TypeScript types, JSON Schema, validators |
| [`packages/runtime/`](packages/runtime/) | Execution engine, providers, protocols |
| [`packages/cli/`](packages/cli/) | CLI tool (`ecp run` / `ecp validate`) |
| [`packages/docs/`](packages/docs/) | TypeDoc documentation generator |
| [`examples/`](examples/) | Example Context manifests |
| [`evals/`](evals/) | Evaluation cases and rubrics |

------------------------------------------------------------------------

## What ECP Is NOT

ECP is not:

-   A workflow builder
-   A chat interface
-   A document tool
-   A BI dashboard
-   A replacement for MCP

ECP is:

-   A packaging format for agent environments
-   A governance layer for AI tool access
-   A portable artifact that can be shared and versioned
-   An open specification for cross-system AI operations

------------------------------------------------------------------------

## Open Core Philosophy

ECP is intended to be:

-   Runtime-agnostic
-   Open specification
-   Compatible with any MCP implementation
-   Portable across environments

Hosted platforms may provide:

-   Managed runtimes
-   Credential vaults
-   Approval workflows
-   Registries
-   Observability
-   Team permissions

But the ECP spec itself should remain open.

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

Future:

-   Signed contexts
-   Registry specification
-   Canonical object schema registry
-   Policy model standardization
-   Multi-agent coordination extensions

------------------------------------------------------------------------

## Get Involved

We welcome:

-   Spec feedback
-   Runtime implementations
-   Context examples
-   Security reviews
-   MCP compatibility testing

If MCP standardized tool calling, ECP aims to standardize portable agent
environments.

Let's build the control plane for cross-system AI agents.
