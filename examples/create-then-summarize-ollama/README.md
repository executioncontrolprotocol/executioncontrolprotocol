# Create then Summarize (Ollama)

Legacy documentation note: this folder previously documented a v0.5 **Context YAML**
example that chained multiple Ollama calls.

The repository has since moved to the v1 model: portable **workflows**
(`@executioncontrolprotocol.workflow`) executed inside configured **environments**.

For current runnable examples, use:

- `examples/01-echo/` — minimal end-to-end example
- `examples/02-weekly-brief/` — multi-step workflow with real extensions

Conceptually, the flow is still the same:

1. **Orchestrator** — outputs a plan that delegates one task to the creator.
2. **Creator** — writes a short article (title + body) on the given topic.
3. **Summarizer** — receives the creator’s article and produces a summary (headline + body).

## Run

```bash
ecp run examples/01-echo/workflow.ts --env examples/01-echo/environment.ts
```
