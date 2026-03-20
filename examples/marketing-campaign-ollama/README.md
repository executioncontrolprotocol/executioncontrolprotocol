# Marketing Campaign (Ollama)

Single-executor example: create a marketing campaign (headline, tagline, key messages, CTA) for a product or topic using Ollama.

## Run

```bash
ecp run examples/marketing-campaign-ollama/context.yaml --provider ollama --model llama3.2:3b -i product="Your product or topic"
```

Example:

```bash
ecp run examples/marketing-campaign-ollama/context.yaml --provider ollama --model llama3.2:3b -i product="ECP — Execution Control Protocol for AI agents"
```
