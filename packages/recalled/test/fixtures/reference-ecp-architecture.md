# ECP Architecture Reference

## Execution Layer

ECP sits between the Model Context Protocol (MCP) and application-level agent frameworks.

### Core Components

- **Context**: A declarative execution environment specification
- **Executor**: An agent instance within a Context
- **Orchestrator**: Coordinates multiple executors using a strategy
- **Mounts**: Data sources attached to executors at runtime

### Orchestration Strategies

| Strategy              | Description                                         |
| --------------------- | --------------------------------------------------- |
| single                | One executor, direct execution                      |
| delegate              | Orchestrator delegates to specialist executors      |
| controller-specialist | Controller plans, specialists execute               |

## Runtime Engine

The ECPEngine processes a Context manifest:

1. Resolve inputs and validate schema
2. Initialize model provider (OpenAI, Ollama, Anthropic, Gemini, Mistral)
3. Mount data sources via MCP
4. Execute according to orchestration strategy
5. Collect outputs and produce execution trace

## Security Model

- Default-deny tool access
- Scoped permissions (read / write / admin)
- Write barriers require approval by default
- Runtime budgets for tool calls, cost, and time
- Full audit logging via execution traces

## Plugin System

Third-party plugins register via:

```typescript
export function register(registry: ExtensionRegistry): void {
  registry.registerModelProvider({ ... });
}
```

Plugins declare manifests in `package.json` under the `ecp` key.
