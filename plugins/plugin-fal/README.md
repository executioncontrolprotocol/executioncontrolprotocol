# @executioncontrolprotocol/plugin-fal

FAL generative inference for ECP (Execution Control Protocol). Install with:

```sh
ecp plugins install fal
```

Capability id `@executioncontrolprotocol/fal.generate` is unchanged. The plugin runs on Node hosts.

## Binding

```ts
import falExtension from "@executioncontrolprotocol/plugin-fal"
import { environment, extension, secrets, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"

export default environment(NODE_ENVIRONMENT_ID, "fal-demo").with([
  extension(falExtension).with({
    apiKey: secrets("fal/api-key"),
    defaultMode: "subscribe",
  }),
])
```

Or install the plugin and let the CLI host load it. Workflow files bind by id
(`extension("@executioncontrolprotocol/fal")`) and never import this package.

See `examples/fal-chain.ecp.ts`.

## Capabilities

| Id | Summary |
| --- | --- |
| `@executioncontrolprotocol/fal.generate` | Run a FAL model endpoint (`run` or `subscribe`) and return the model payload. |

```sh
ecp fal generate --help --json
```

## Config

| Field | Description |
| --- | --- |
| `apiKey` | FAL API key. Bind with `secrets("fal/api-key")`. Falls back to `FAL_KEY`. |
| `defaultEndpoint` | Endpoint id when a step omits `endpoint`. |
| `defaultMode` | `run` or `subscribe` (default `subscribe`). |

## Authoring

This package keeps `src/` and a minimal `package.json`. `ecp plugins build` generates the oclif files. Do not hand-write command classes.
