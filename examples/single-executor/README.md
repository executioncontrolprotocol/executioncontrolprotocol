# Single Executor Example

A minimal ECP Context with one executor and no tool calls. Demonstrates the simplest end-to-end flow.

## What it does

Given a `topic` input, the `summarizer` executor calls the LLM once and produces a structured `Summary` output with a `headline` and `body`.

## Run it

```bash
# From the repo root (Ollama must be running; default model gemma3:1b)
ecp run examples/single-executor/context.yaml \
  --provider ollama \
  --model gemma3:1b \
  \
  --input topic="Execution Control Protocol" \
  --debug
```

## Requirements

- [Ollama](https://ollama.com/) installed and running, with the model you pass to `--model` pulled (e.g. `ollama pull gemma3:1b`).
