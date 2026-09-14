# @executioncontrolprotocol/harnesses-browser-coding

Browser Coding harness (`@executioncontrolprotocol/harness-browser-coding`) for local coding models (Ollama `qwen2.5-coder:1.5b` eval matrix).

- **TypeScript-first:** Fluent workflows and typed `EcpIntent` / `HarnessReply` modules (no EQL).
- **Chat + eval matrix** — browser demo can bind this harness (e.g. with Ollama); eval matrix covers intent/authoring/assistant.

## Fixtures and evals

| Asset | Location |
| ----- | -------- |
| Prompt fixtures | `fixtures/harness-prompts/*.prompt.json` |
| Eval cases | `fixtures/eval-cases/*.cases.json` (75 cases; no chat/flow) |
| Support fixtures | `fixtures/workflows/`, `fixtures/runs/` |
| Matrix tests | `test/eval/` |

Run matrix from repo root: `pnpm run test:eval:matrix:coding`

For Anthropic / Sonnet context flow (system prompts, multi-shot chat, repair, pass/fail matrix notes), see [docs/sonnet-coding-interaction-loop.md](./docs/sonnet-coding-interaction-loop.md).

```ts
import { registerBrowserCodingHarnesses, BROWSER_CODING_HARNESS_CAPABILITY } from "@executioncontrolprotocol/harnesses-browser-coding"
```
