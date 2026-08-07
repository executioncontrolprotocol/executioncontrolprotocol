# Assessment verification (validation sprint)

This document records gaps closed from [ecp-implementation-assessment.md](ecp-implementation-assessment.md) and where behavior is verified in tests.

| Area | Status | Tests / artifacts |
| ---- | ------ | ----------------- |
| Step lifecycle (`finally`, `failed`, pre pause/deny) | Verified | `packages/core/test/lifecycle.test.ts` |
| Store mutations + `history[].mutations` | Verified | `packages/core/test/store-mutation.test.ts` |
| Fluent API surface | Verified | `packages/core/test/fluent-api.test.ts` |
| JSON Schema artifacts (`@executioncontrolprotocol/types`) | Verified | `npm run generate:schema`, `packages/types/test/schemas.test.ts` |
| Describe / search | Verified | `packages/core/test/describe.test.ts`, `packages/core/test/search.test.ts` |
| `@executioncontrolprotocol/state-control` | Present | `packages/policies`, used in lifecycle/store tests |
| `@executioncontrolprotocol/openai.evaluate` | Verified | `packages/extensions/openai/test/openai.test.ts` |
| `@executioncontrolprotocol/storage` read/write | Verified | `packages/extensions/storage/test/storage.test.ts` |
| `@executioncontrolprotocol/memory` hooks | Verified | `packages/extensions/memory/test/memory.test.ts` |
| Example `02-weekly-brief` | Verified | `packages/core/test/weekly-brief.test.ts` |
| E2E project (Ollama) | Non-failing placeholder | `packages/extensions/ollama/test/e2e/ollama-skip.test.ts` |

| Browser / Node runtimes | Verified | `packages/runtimes/browser/test/*`, `packages/runtimes/node/test/*` |
| Environment lifecycle | Verified | `packages/core/test/environment-events.test.ts` |
| Registry freeze | Verified | `packages/core/test/registry-freeze.test.ts` |
| Config resolver chain | Verified | `packages/core/test/env-resolution.test.ts` |

**Deferred (unchanged):** `ecp mcp serve` CLI, MCP resources/prompts/HTTP, semantic search, Temporal executor.

Platform runtime design: see `ecp/Browser Runtime Spec.md` in the memory workspace (source spec for this migration).
