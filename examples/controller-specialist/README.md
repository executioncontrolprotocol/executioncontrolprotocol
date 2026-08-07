# Controller-Specialist Example

Legacy documentation note: this folder previously documented a v0.5 **Context YAML**
example (“controller-specialist”). The repository has since moved to the v1 model:
portable **workflows** (`@executioncontrolprotocol.workflow`) executed inside configured **environments**.

If you are looking for current runnable examples, start here instead:

- `examples/01-echo/` — smallest end-to-end example (`ecp run … --env …`)
- `examples/02-weekly-brief/` — multi-step workflow using memory + model + Slack

## What it does

Conceptually, the scenario is still useful:

1. A controller produces a plan
2. Specialists execute delegated tasks
3. A publisher/merger combines results into a final artifact

## Run it

```bash
ecp run examples/01-echo/workflow.ts --env examples/01-echo/environment.ts
```

## Requirements

- Node.js 22+
