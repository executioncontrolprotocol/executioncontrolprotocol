# @executioncontrolprotocol/harnesses-browser-coding

Browser Coding harness (`@executioncontrolprotocol/harness-browser-coding`) for local coding models (Ollama `qwen2.5-coder:1.5b` eval matrix).

- **TypeScript-first:** Fluent workflows and typed `EcpIntent` / `HarnessReply` modules (no EQL).
- **Eval matrix only** — browser demo continues to use `@executioncontrolprotocol/harnesses-browser-nano`.

## Fixtures and evals

| Asset | Location |
| ----- | -------- |
| Prompt fixtures | `fixtures/harness-prompts/*.prompt.json` |
| Eval cases | `fixtures/eval-cases/*.cases.json` (63 cases; no chat/flow) |
| Support fixtures | `fixtures/workflows/`, `fixtures/runs/` |
| Matrix tests | `test/eval/` |

Run matrix: `npm run eval:matrix -w @executioncontrolprotocol/harnesses-browser-coding`

```ts
import { registerBrowserCodingHarnesses, BROWSER_CODING_HARNESS_CAPABILITY } from "@executioncontrolprotocol/harnesses-browser-coding"
```
