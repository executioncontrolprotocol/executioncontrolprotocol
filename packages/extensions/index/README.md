# @executioncontrolprotocol/extensions

Optional convenience bundle that registers the **host-agnostic, dependency-light**
first-party extensions in one call.

```ts
import { registerAllExtensions } from "@executioncontrolprotocol/extensions"

await registerAllExtensions()
```

## What `registerAllExtensions()` registers

| Extension | Purpose |
| --------- | ------- |
| `@executioncontrolprotocol/memory` | Memory capabilities + lifecycle hooks |
| `@executioncontrolprotocol/storage` | Key/value storage capabilities |
| `@executioncontrolprotocol/slack` | Slack send capability |
| `@executioncontrolprotocol/telemetry` | Lifecycle telemetry hooks |
| `@executioncontrolprotocol/openai` | OpenAI model provider |
| `@executioncontrolprotocol/ollama` | Local Ollama model provider |
| `@executioncontrolprotocol/format-toon` | TOON encode/decode |
| `@executioncontrolprotocol/format-eql` | EQL encode/decode (harness output) |
| `@executioncontrolprotocol/format-mermaid` | Mermaid encode (workflow graph) |

The exact set is exported as `BUNDLED_EXTENSION_IDS`.

## Intentionally excluded

These are **not** registered by `registerAllExtensions()` because they are
host-specific or require credentials. Register them explicitly when needed:

| Extension | Why excluded |
| --------- | ------------ |
| `@executioncontrolprotocol/chrome-ai` | Browser-only (Chrome on-device `LanguageModel` API) |
| `@executioncontrolprotocol/claude` | Requires Anthropic provider configuration/credentials |

```ts
import { registerChromeAiExtension } from "@executioncontrolprotocol/chrome-ai"
await registerChromeAiExtension()
```

This mirrors the spec guidance that the convenience bundle should avoid forcing
heavy or host-specific transitive dependencies.
