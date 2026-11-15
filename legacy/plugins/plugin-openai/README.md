# @executioncontrolprotocol/plugin-openai

OpenAI model provider for ECP (Execution Control Protocol). Install with:

```sh
ecp plugins install openai
```

Capability id `@executioncontrolprotocol/openai.generate` is unchanged. The plugin runs on Node hosts.

## Binding

```ts
import openaiExtension from "@executioncontrolprotocol/plugin-openai"
import { environment, extension, secrets, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"

export default environment(NODE_ENVIRONMENT_ID, "openai-demo").with([
  extension(openaiExtension).with({
    apiKey: secrets("openai/api-key"),
    defaultModel: "gpt-4o-mini",
  }),
])
```

Or install the plugin and let the CLI host load it. Workflow files bind by id
(`extension("@executioncontrolprotocol/openai")`) and never import this package.

## Capabilities

| Id | Summary |
| --- | --- |
| `@executioncontrolprotocol/openai.generate` | Chat completion against the OpenAI Chat Completions API. Text only; `files` are rejected. |

```sh
ecp openai generate --help --json
```

## Config

| Field | Description |
| --- | --- |
| `apiKey` | OpenAI API key. Bind with `secrets("openai/api-key")`. Falls back to `OPENAI_API_KEY`. |
| `defaultModel` | Model id when a step omits `model`. Defaults to `gpt-4o-mini`. |

## Authoring

This package keeps `src/index.ts` and a minimal `package.json`. `ecp plugins build` generates the oclif files. Do not hand-write command classes.
