# @executioncontrolprotocol/plugin-ollama

Ollama model provider for ECP (Execution Control Protocol). Install with:

```sh
ecp plugins install ollama
```

Capability ids `@executioncontrolprotocol/ollama.generate` and
`@executioncontrolprotocol/ollama.listModels` are unchanged. The plugin runs on Node hosts
and talks to a local Ollama server. It does not send secrets.

## Binding

```ts
import ollamaExtension from "@executioncontrolprotocol/plugin-ollama"
import { environment, extension, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"

export default environment(NODE_ENVIRONMENT_ID, "ollama-demo").with([
  extension(ollamaExtension).with({
    baseURL: "http://127.0.0.1:11434",
    defaultModel: "qwen2.5-coder:7b",
  }),
])
```

Or install the plugin and let the CLI host load it.

## Capabilities

| Id | Summary |
| --- | --- |
| `@executioncontrolprotocol/ollama.generate` | Chat completion against a local Ollama `/api/chat` endpoint. Text only; `files` are rejected. |
| `@executioncontrolprotocol/ollama.listModels` | List model tags from `/api/tags`. |

```sh
ecp ollama generate --help --json
ecp ollama listModels --help --json
```

## Config

| Field | Description |
| --- | --- |
| `baseURL` | Ollama server URL. Falls back to `OLLAMA_BASE_URL`, then `http://127.0.0.1:11434`. |
| `defaultModel` | Model tag when a step omits `model`. |
| `timeoutMs` | Optional request timeout. |

No `secrets("…")` keys. Point `baseURL` at your local server.

## Authoring

This package keeps `src/index.ts` and a minimal `package.json`. `ecp plugins build` generates the oclif files. Do not hand-write command classes.
