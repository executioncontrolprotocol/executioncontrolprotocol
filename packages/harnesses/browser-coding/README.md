# @executioncontrolprotocol/harnesses-browser-coding

Browser Coding harness (`@executioncontrolprotocol/harness-browser-coding`) for coding models (Ollama `qwen2.5-coder:1.5b` **small** profile; Anthropic Sonnet **medium** / Opus **frontier**).

- **TypeScript-first:** Fluent workflows and typed `EcpIntent` / `HarnessReply` modules (no EQL).
- **Chat + eval matrix** — browser demo can bind this harness (e.g. with Ollama or Anthropic); eval matrix covers intent/authoring/assistant/chat.
- **Profiles:** `small` keeps compact plain inventory + heavier few-shots. `medium` / `frontier` use a Fluent capability catalog, thin grammar few-shots, generate `messages[]` for conversation history, and repair-as-turns (failed TypeScript as an assistant turn).

## Generate contract

Providers implement `@executioncontrolprotocol/model.generate` with:

- `prompt` — current user turn (required)
- `system` — optional
- `messages` — optional prior `{ role: "user" | "assistant", content }` turns
- `files` — attach to the current turn

The host (demo) passes `conversationMessages` on chat invokes; the harness forwards them on authoring/assistant shots. New chats omit `messages`.

## Fixtures and evals

| Asset | Location |
| ----- | -------- |
| Prompt fixtures | `fixtures/harness-prompts/*.prompt.json` |
| Eval cases | `fixtures/eval-cases/*.cases.json` |
| Support fixtures | `fixtures/workflows/`, `fixtures/runs/` |
| Matrix tests | `test/eval/` |

Run matrix from repo root: `pnpm run test:eval:matrix:coding`  
Anthropic / Sonnet: `pnpm run test:eval:matrix:coding:anthropic`

For medium/frontier context flow (system prompts, `messages[]`, Fluent catalog, repair turns), see [docs/sonnet-coding-interaction-loop.md](./docs/sonnet-coding-interaction-loop.md).

```ts
import { registerBrowserCodingHarnesses, BROWSER_CODING_HARNESS_CAPABILITY } from "@executioncontrolprotocol/harnesses-browser-coding"
```
