# @executioncontrolprotocol/plugin-anthropic

Anthropic Claude model provider for ECP (Execution Control Protocol). Install with:

```sh
ecp plugins install anthropic
```

Capability id `@executioncontrolprotocol/anthropic.generate` is unchanged. The plugin runs on Node and browser hosts.

## Binding

```ts
import anthropicExtension from "@executioncontrolprotocol/plugin-anthropic"
import { environment, extension, secrets, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"

export default environment(NODE_ENVIRONMENT_ID, "anthropic-demo").with([
  extension(anthropicExtension).with({
    apiKey: secrets("anthropic/api-key"),
    defaultModel: "claude-sonnet-4-5",
  }),
])
```

Or install the plugin and let the CLI host load it.

## Capabilities

| Id | Summary |
| --- | --- |
| `@executioncontrolprotocol/anthropic.generate` | Chat completion against the Anthropic Messages API. Optional `files` on the last user turn for images and PDFs. |

```sh
ecp anthropic generate --help --json
```

## Config

| Field | Description |
| --- | --- |
| `apiKey` | Anthropic API key. Bind with `secrets("anthropic/api-key")`. Falls back to `ANTHROPIC_API_KEY`. |
| `defaultModel` | Model id when a step omits `model`. |

## Multimodal `files`

Optional `files` on `generate` are portable `FileRef` values.

| Kind | MIME |
| --- | --- |
| Image | `image/jpeg`, `image/png`, `image/gif`, `image/webp` |
| Document | `application/pdf` |

Unsupported MIME types are rejected before the API call. Browser calls send the
`anthropic-dangerous-direct-browser-access` header. There is no browser secrets vault.

## Authoring

This package keeps `src/index.ts` and a minimal `package.json`. `ecp plugins build` generates the oclif files. Do not hand-write command classes.
