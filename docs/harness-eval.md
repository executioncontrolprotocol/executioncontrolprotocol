# Harness evaluation (local)

Harnesses orchestrate model calls, format decode, and validation. Use them for repeatable provider comparisons (demo, Ollama, Chrome AI, cloud APIs).

For a **full matrix catalog** (every case, assertion, judge goal, and fixture), see [harness-eval-matrix-report.md](./harness-eval-matrix-report.md).

## Standard harnesses

| Harness | Capability | Purpose |
| ------- | ---------- | ------- |
| `@executioncontrolprotocol/harness-browser-nano` | `@executioncontrolprotocol/harness-browser-nano.evaluate` | Browser demo + Ollama Gemma matrix; EQL output |
| `@executioncontrolprotocol/harness-browser-coding` | `@executioncontrolprotocol/harness-browser-coding.evaluate` | Ollama Qwen coding matrix; TypeScript (Fluent + typed intent/reply) |

Both harnesses use the same `task` routing: `workflow-authoring`, `intent-classification`, `workflow-assistant`.

## `@executioncontrolprotocol/evals` package (framework)

`@executioncontrolprotocol/evals` provides the **eval framework** only: case schema, `runEvalCase`, assertions, provider profiles, and `createNodeEvalFixturesLoader` / `createBrowserEvalFixturesLoader`. Harness packages own prompt fixtures, eval case JSON, workflow/run support fixtures, and matrix test drivers under `packages/harnesses/*/test/eval/`.

### Pinned Ollama profile (no env overrides)

Eval model and URL are defined in code, not `OLLAMA_MODEL` / `OLLAMA_BASE_URL`:

| Setting | Baked value |
| ------- | ----------- |
| Profile | `ollama-gemma-1b` (`OLLAMA_GEMMA_1B_EVAL`) |
| Base URL | `http://localhost:11434` |
| Model | `gemma3:1b` |
| Provider | `@executioncontrolprotocol/ollama.generate` |

Source: [`packages/evals/src/profiles/ollama-gemma.ts`](../packages/evals/src/profiles/ollama-gemma.ts).

### Chrome Nano profile

| Setting | Baked value |
| ------- | ----------- |
| Profile | `chrome-nano` (`CHROME_NANO_EVAL`) |
| Provider | `@executioncontrolprotocol/chrome-ai.generate` |
| Runtime | `@executioncontrolprotocol/browser` |

Source: [`packages/evals/src/profiles/chrome-nano.ts`](../packages/evals/src/profiles/chrome-nano.ts).

### Reusable harness, swappable providers

`@executioncontrolprotocol/harness-browser-nano` owns prompts, repair loops, EQL decode, and validation. Providers only implement `@executioncontrolprotocol/model.generate`. Matrix evals use `createNanoOllamaMatrixEnvironment()` (Node) or `createNanoBrowserMatrixEnvironment(CHROME_NANO_EVAL)` (browser) — same harness binding (`HARNESS_NANO_BINDING`); only `.uses()` and runtime change.

The browser demo uses the same matrix harness profile; the UI swaps providers via `.uses(@executioncontrolprotocol/chrome-ai.generate)` (or OpenAI, Claude, etc.) at invoke time.

### Run

```sh
ollama pull gemma3:1b
npm run eval:matrix
```

Browser Coding matrix (Qwen 2.5 Coder 1.5B, same 72 JSON fixtures):

```sh
ollama pull qwen2.5-coder:1.5b
npm run eval:matrix:coding
```

Profile: `ollama-qwen-coder-1.5b` in [`packages/evals/src/profiles/ollama-qwen.ts`](../packages/evals/src/profiles/ollama-qwen.ts).

Browser Coding uses **Fluent TypeScript only** (full revised `export default workflow(...)` modules). Patch/create user prompts use [`buildFluentPatchHintLines`](../packages/harnesses/browser-coding/src/fluent-patch-hints.ts), not EQL `UPDATE STEP` / `DELETE STEP` vocabulary. Baselines rendered with [`renderWorkflowToFluent`](../packages/core/src/fluent/render-workflow.ts) emit stable `.id("stepId")` on steps.

Recent matrix snapshot (`qwen2.5-coder:1.5b`, 63 deterministic cases across patch/create/assistant/intent): **72/73 passed** (remaining failures are occasional model flakiness, e.g. `asst-04`).

Chrome Nano (same fixture matrix, Vitest browser + installed Chrome):

```sh
npm run eval:matrix:chrome
```

Smoke (legacy harness tests + fixture count, no full matrix):

```sh
npm run test:eval:smoke
```

Tests **skip** when Ollama or `gemma3:1b` is unavailable. When Ollama is up, failures are real assertion failures.

### Eval sets

| Eval set | Factory | Tests |
| -------- | ------- | ----- |
| **Matrix Nano (81 Ollama cases)** | `createNanoOllamaMatrixEnvironment()` | [`packages/harnesses/browser-nano/test/eval/matrix-*.eval.test.ts`](../packages/harnesses/browser-nano/test/eval/) |
| **Matrix Coding (63 Ollama cases)** | `createCodingOllamaMatrixEnvironment()` | [`packages/harnesses/browser-coding/test/eval/matrix-*.eval.test.ts`](../packages/harnesses/browser-coding/test/eval/) |
| **Matrix Chrome Nano** | `createNanoBrowserMatrixEnvironment(CHROME_NANO_EVAL)` | [`packages/harnesses/browser-nano/test/eval/browser/matrix-*.eval.test.ts`](../packages/harnesses/browser-nano/test/eval/browser/) |

| Scenario | Invoke | Model output encoding |
| -------- | ------ | --------------------- |
| Create workflow | `@executioncontrolprotocol/harness-browser-nano.evaluate` + `task: "workflow-authoring"` | `@executioncontrolprotocol/format-eql` |
| Patch workflow | `@executioncontrolprotocol/harness-browser-nano.evaluate` + `task: "workflow-authoring"` | `@executioncontrolprotocol/format-eql` |
| Intent | `@executioncontrolprotocol/harness-browser-nano.evaluate` + `task: "intent-classification"` | `@executioncontrolprotocol/format-eql` |
| Assistant | `@executioncontrolprotocol/harness-browser-nano.evaluate` + `task: "workflow-assistant"` | `@executioncontrolprotocol/format-eql` |

Browser demo and Chrome Nano matrix evals share **`HARNESS_NANO_BINDING`**; only the model provider (`.uses(...)` at invoke) differs. Run context in prompts may still use `@executioncontrolprotocol/format-json` for encoding prior run results — that is separate from the model's structured reply format.

Workflow environment: [`packages/evals/src/environments/harness-ollama-workflow.ts`](../packages/evals/src/environments/harness-ollama-workflow.ts).

[`examples/harness-ollama/environment.ts`](../examples/harness-ollama/environment.ts) re-exports `createHarnessOllamaEnvironment()` (combined workflow + intent).

Intent eval environments bind `@executioncontrolprotocol/format-toon` and `@executioncontrolprotocol/test` (same as workflow) and include a **summarized** environment capability block in the user prompt (see `summarizeEnvironmentDescriptor` in `@executioncontrolprotocol/core`). System prompts come from harness-owned fixtures via `buildSystemPromptFromFixture()` — not from eval case JSON.

## Flow eval failures (step 0)

Multi-step `flow` cases in [`flow.cases.json`](../packages/harnesses/browser-nano/fixtures/eval-cases/flow.cases.json) run harness invokes sequentially. Failures at **step 0** are almost always **intent-classification harness invoke** failures (decode/validation/repair), not `ecp.run()` execution and not failure to load `fixtures/runs/*.json` (run fixtures are used on later assistant steps only).

## Traceability

When an eval fails, use harness `trace` and eval helpers:

- **Invoke failed:** `invokeSuccess` assertions append `error`, `rawOutput`, and validation issues when present (`packages/evals/src/fixtures/assertions.ts`).
- **Judge:** `@executioncontrolprotocol/ollama.evaluate` runs only when the active eval provider is Ollama (`ollama-gemma-1b`); skipped for Chrome Nano matrix runs.
- **Wrong intent/artifact:** inspect `formatHarnessTrace(harnessOutput)` from `@executioncontrolprotocol/evals`.

## Fixture-driven matrix

Add rows to `packages/harnesses/<harness>/fixtures/eval-cases/*.cases.json` (JSON arrays). Matrix tests call `loadEvalCasesFromDir` (via harness-local loaders) and `runEvalCase()` — no per-case Vitest files.

- **Deterministic** assertions: `invokeSuccess`, `artifactSchema`, `intent`, `stepUses`, `validationValid`, etc.
- **Judge** assertions: `judge.enabled` uses `@executioncontrolprotocol/ollama.evaluate` with `goal` / `rubric`.

See [packages/evals/README.md](../packages/evals/README.md#fixture-driven-matrix-json).

## Creating new eval cases (smoke / manual)

1. **Pick an eval set** — matrix JSON row vs legacy smoke test file.
2. **Add a fixture** under `packages/harnesses/<harness>/fixtures/workflows/` or `fixtures/runs/` when needed.
3. For matrix cases, edit the appropriate `*.cases.json` file; for smoke, add `packages/evals/test/harness/<name>.eval.test.ts`.
4. **Use the matching environment factory** — `createHarnessOllamaMatrixEnvironment()` for matrix rows.
5. **Assert narrowly** — schema, validation, decode trace, and concrete artifact fields.
6. **Keep fast tests in core** — `packages/core/test/harness/` with `@executioncontrolprotocol/test.generate` runs in every `npm run check`.

Example skeleton:

```ts
import { harnessCapabilityId } from "@executioncontrolprotocol/types"
import {
  OLLAMA_GEMMA_1B_EVAL,
  createHarnessOllamaWorkflowEnvironment,
  ollamaEvalReady,
} from "@executioncontrolprotocol/evals"
import { assertHarnessInvokeSuccess, harnessResult } from "./assert-harness-result.js"

const readiness = await ollamaEvalReady()
describe.skipIf(!readiness.ready)("my eval", () => {
  it("...", async () => {
    const ecp = await (await createHarnessOllamaWorkflowEnvironment()).init()
    const result = await ecp
      .invoke(EVALS_WORKFLOW_AUTHORING_CAPABILITY)
      .with({ request: "...", model: OLLAMA_GEMMA_1B_EVAL.model })
      .process()
    assertHarnessInvokeSuccess(result)
    await ecp.terminate()
  }, 120_000)
})
```

### Adding a new profile (e.g. another model)

1. Add `packages/evals/src/profiles/<name>.ts` with `baseURL`, `model`, `providerId`.
2. Add `packages/evals/src/environments/harness-<name>.ts` binding extensions and harnesses.
3. Export from [`packages/evals/src/index.ts`](../packages/evals/src/index.ts).
4. Point new eval tests at `ollamaEvalReady(yourProfile)` and your factory.

## Invoke pattern

```ts
const result = await ecp
  .invoke("@executioncontrolprotocol/evals-workflow-authoring.evaluate")
  .with({
    request: "Create an echo workflow",
    model: "gemma3:1b",
  })
  .process()
```

Environment bindings already set `defaultModel` on `@executioncontrolprotocol/ollama`; invoke `model` reinforces the pinned tag per call.

## Core formatters

| Formatter | Id |
| --------- | -- |
| JSON | `@executioncontrolprotocol/format-json` (core) |
| Fluent | `@executioncontrolprotocol/format-fluent` (core) |
| TOON | `@executioncontrolprotocol/format-toon` (extension) |

Encode/decode always require `.uses(formatterId)` — no `.as("fluent")` shorthand.

## Trace fields

Harness results include `trace` with `harness`, `provider`, `outputFormat`, `decodeSucceeded`, and optional `prompt` / `rawOutput` when enabled in harness config.

## CI

Scheduled workflow [`.github/workflows/evals.yml`](../.github/workflows/evals.yml) pulls `gemma3:1b` (by default) and runs `npm run eval:harness` after CLI evals. The harness eval profile matches that model tag in source.
