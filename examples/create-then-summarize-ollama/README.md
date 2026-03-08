# Create then Summarize (Ollama)

Two sequential Ollama calls:

1. **Orchestrator** — outputs a plan that delegates one task to the creator.
2. **Creator** — writes a short article (title + body) on the given topic.
3. **Summarizer** — receives the creator’s article and produces a summary (headline + body).

## Run

```bash
npx tsx packages/cli/src/index.ts run examples/create-then-summarize-ollama/context.yaml --provider ollama --enable ollama --model llama3.2:3b -i topic="Your topic here"
```

With a global `ecp`:

```bash
ecp run examples/create-then-summarize-ollama/context.yaml --provider ollama --enable ollama --model llama3.2:3b -i topic="Your topic here"
```

## Example

```bash
npx tsx packages/cli/src/index.ts run examples/create-then-summarize-ollama/context.yaml --provider ollama --enable ollama --model llama3.2:3b -i topic="Benefits of local AI models"
```
