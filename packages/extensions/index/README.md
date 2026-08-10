# @executioncontrolprotocol/extensions

Optional convenience bundle that registers the **host-agnostic, dependency-light**
first-party protocol/platform extensions in one call.

```ts
import { registerAllExtensions } from "@executioncontrolprotocol/extensions"

await registerAllExtensions()
```

## What `registerAllExtensions()` registers

| Extension | Purpose |
| --------- | ------- |
| `@executioncontrolprotocol/memory` | Memory capabilities + lifecycle hooks |
| `@executioncontrolprotocol/storage` | Key/value storage capabilities |
| `@executioncontrolprotocol/telemetry` | Lifecycle telemetry hooks |
| `@executioncontrolprotocol/openai` | OpenAI model provider |
| `@executioncontrolprotocol/ollama` | Local Ollama model provider |
| `@executioncontrolprotocol/format-toon` | TOON encode/decode |
| `@executioncontrolprotocol/format-eql` | EQL encode/decode (harness output) |
| `@executioncontrolprotocol/format-mermaid` | Mermaid encode (workflow graph) |

The exact set is exported as `BUNDLED_EXTENSION_IDS`.

## Intentionally excluded

| Extension | Why excluded |
| --------- | ------------ |
| `@executioncontrolprotocol/chrome-ai` | Browser-only (Chrome on-device `LanguageModel` API) |
| `@executioncontrolprotocol/claude` | Requires Anthropic provider configuration/credentials |
| `@executioncontrolprotocol/fal` | Vendor — [executioncontrolprotocol-extensions](https://github.com/GuillaumeCleme/executioncontrolprotocol-extensions) |
| `@executioncontrolprotocol/slack` | Vendor — same extensions repo |
| `@executioncontrolprotocol/image-sharp` | Vendor — same extensions repo |
| `@executioncontrolprotocol/adobe` | Vendor scaffold — same extensions repo |

```ts
import { registerFalExtension } from "@executioncontrolprotocol/fal"
await registerFalExtension()
```
