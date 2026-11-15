# @executioncontrolprotocol/plugin-format-mermaid

Mermaid diagram encode for ECP (Execution Control Protocol). Install with:

```sh
ecp plugins install format-mermaid
```

Capability id `@executioncontrolprotocol/format-mermaid.encode` is unchanged. The plugin also
registers the `mermaid` format for `ecp environments describe --format mermaid` and `ecp workflows compile --format mermaid`.
Encode-only; it does not parse Mermaid back into workflows.

## Binding

```ts
import formatMermaidExtension from "@executioncontrolprotocol/plugin-format-mermaid"
import { environment, extension, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"

export default environment(NODE_ENVIRONMENT_ID, "mermaid-demo").with([
  extension(formatMermaidExtension),
])
```

Or install the plugin and let the CLI host load it.

## Capabilities

| Id | Summary |
| --- | --- |
| `@executioncontrolprotocol/format-mermaid.encode` | Render a workflow manifest as Mermaid flowchart text. |

```sh
ecp format-mermaid encode --input workflow.json --json
```

No `secrets("…")` keys. No extension config.

## Authoring

This package keeps `src/` and a minimal `package.json`. `ecp plugins build` generates the oclif files. Do not hand-write command classes.
