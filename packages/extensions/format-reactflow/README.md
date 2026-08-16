# `@executioncontrolprotocol/format-reactflow`

Encode-only formatter that turns an `@executioncontrolprotocol.workflow` manifest into React Flow–compatible JSON (nodes with Zod-backed ports, `$ref` data edges, control-flow edges, and dagre layout).

Also binds lifecycle hooks that publish run progress on {@link reactFlowRunProgress} for browser viewers.

```ts
import "@executioncontrolprotocol/format-reactflow"
import { registerFormatReactflowExtension, reactFlowRunProgress } from "@executioncontrolprotocol/format-reactflow"

await registerFormatReactflowExtension()
env.addExtensionBinding("@executioncontrolprotocol/format-reactflow", {})

const encoded = await ecp
  .encode(manifest)
  .uses("@executioncontrolprotocol/format-reactflow")
  .process()

reactFlowRunProgress.addEventListener("step:status", (ev) => {
  // CustomEvent detail: { stepId, status }
})
```
