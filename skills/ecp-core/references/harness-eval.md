# Harness and eval integrity (ECP core)

Reusable helpers: `defineHarness`, `runModelRepairLoop`, `buildSystemPrompt`, … from `@executioncontrolprotocol/core`.

| Harness | Package | Surface |
| ------- | ------- | ------- |
| Browser Nano | `@executioncontrolprotocol/harnesses-browser-nano` | EQL chat |
| Browser Coding | `@executioncontrolprotocol/harnesses-browser-coding` | Fluent/TS |

## Integrity rules

- Do **not** delete, skip, or weaken **valid** failing matrix/smoke eval tests to green CI
- Do **not** fail-open quality gates (LLM judge, schema validation) on errors
- Triage harness prompts vs model vs fixture before changing assertions

Eval profile is baked in `@executioncontrolprotocol/evals` (not inventing `OLLAMA_MODEL` env for the matrix).

This is separate from consumer `ecp test` CLI sessions (frozen workflow state).
