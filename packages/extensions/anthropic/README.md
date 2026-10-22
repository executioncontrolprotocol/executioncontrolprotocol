# `@executioncontrolprotocol/anthropic`

Anthropic Messages API model provider for ECP (`anthropic.generate`).

## Auth

- Extension config `apiKey`, or
- `ANTHROPIC_API_KEY` from the process environment (Node)

Browser calls can pass `ANTHROPIC_API_KEY` in extension config and send the
`anthropic-dangerous-direct-browser-access` header. There is no browser secrets vault after
Phase 1.

## Multimodal `files`

Optional `files` on `model.generate` are portable `FileRef` values. Supported MIME types:

| Kind | MIME |
| ---- | ---- |
| Image | `image/jpeg`, `image/png`, `image/gif`, `image/webp` |
| Document | `application/pdf` |

Unsupported MIME types are rejected before the API call.
