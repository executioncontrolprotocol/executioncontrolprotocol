# Controller-Specialist Example

A multi-agent ECP Context demonstrating the delegate orchestration strategy.

## What it does

1. **Orchestrator** receives a `subject` input and produces a `Plan` with research areas and delegation tasks
2. **Technical Analyst** receives a delegated task and produces `TechnicalFindings`
3. **Practical Analyst** receives a delegated task and produces `PracticalFindings`
4. **Publisher** merges all findings into a final `Report`

## Run it

```bash
# From the repo root
npx tsx packages/cli/src/index.ts run examples/controller-specialist/context.yaml \
  --input subject="Model Context Protocol" \
  --debug
```

## Requirements

- `OPENAI_API_KEY` environment variable set
