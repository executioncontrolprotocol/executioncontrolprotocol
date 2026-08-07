# AGENTS.md

## ECP Fluent API monorepo (`@executioncontrolprotocol/*`)

| Path | Purpose |
| ---- | ------- |
| `packages/types/` | Protocol types (`@executioncontrolprotocol/types`) — [README](packages/types/README.md) |
| `packages/core/` | Fluent API, environment, in-memory engine (`@executioncontrolprotocol/core`) — [README](packages/core/README.md) |
| `packages/runtimes/node/` | Node runtime host (`@executioncontrolprotocol/node`) — [README](packages/runtimes/node/README.md) |
| `packages/runtimes/browser/` | Browser runtime host (`@executioncontrolprotocol/browser`) — [README](packages/runtimes/browser/README.md) |
| `packages/runtimes/temporal/` | Temporal runtime adapter stub (`@executioncontrolprotocol/runtime-temporal`) |
| [Browser demo (standalone)](https://github.com/GuillaumeCleme/executioncontrolprotocol-browser-demo) | Reference browser demo app (UI only) |
| `packages/mcp/` | MCP adapter (`@executioncontrolprotocol/mcp`) |
| `packages/cli/` | `ecp` CLI (`@executioncontrolprotocol/cli`) |
| `packages/policies/` | Budget, approval, state-control (`@executioncontrolprotocol/policies`) |
| `packages/evals/` | Harness/provider eval tests (`@executioncontrolprotocol/evals`, private); pinned `gemma3:1b` @ `localhost:11434` — see [packages/evals/README.md](packages/evals/README.md) |
| `packages/harnesses/browser-nano/` | Browser Nano harness (`@executioncontrolprotocol/harnesses-browser-nano`) — small-model demo + eval matrix |
| `packages/harnesses/browser-coding/` | Browser Coding harness (`@executioncontrolprotocol/harnesses-browser-coding`) — TypeScript/Fluent surface; Qwen 4B eval matrix |
| `packages/extensions/*/` | First-party extensions |
| `archive/legacy-v0.5/` | Archived v0.5 Oclif CLI and snippets |
| `ecp-overhaul.md` | Implementation spec (source of truth) |

### Package boundaries

**Core is runtime-agnostic.** The main `@executioncontrolprotocol/core` barrel has no Node or browser I/O. Host-specific code is on subpaths:

| Subpath | Host |
| ------- | ---- |
| `@executioncontrolprotocol/core/node` | Node convenience re-export (loaders + compile) |
| `@executioncontrolprotocol/core/compile` | Node esbuild compile |
| `@executioncontrolprotocol/core/loaders` | Node file I/O (CLI) |
| `@executioncontrolprotocol/core/browser` | Browser authoring + esbuild-wasm compile |

**Hosts wrap core; extensions never import hosts.** `@executioncontrolprotocol/node` and `@executioncontrolprotocol/browser` bind runtimes and config extensions. Extension packages under `packages/extensions/` depend on `@executioncontrolprotocol/types` + `@executioncontrolprotocol/core` only.

**Browser runtime vs browser demo app:**

| `@executioncontrolprotocol/browser` (runtime) | [executioncontrolprotocol-browser-demo](https://github.com/GuillaumeCleme/executioncontrolprotocol-browser-demo) (app) |
| ------------------------ | ------------------------- |
| Executor, registry, session config, `createEcp`, workflow shim | React/Vite UI, chat layout, panels, Mermaid viewer |
| Optional reference helpers: `createBrowserDemoEnvironment`, `BrowserAuthoringService` | Demo-only: `provider-mode.ts`, first-run modal, localStorage for provider choice |
| Caller supplies `providerCapabilityId` to authoring | App maps user provider pick → capability id |

Do not add demo UI types (e.g. `ProviderMode`) to `@executioncontrolprotocol/browser`; keep them in the demo app.

**Operational APIs live on `Ecp` after `init()`**, not on the `Environment` builder (`run`, `encode`, `decode`, `patch`, `validate`, `describe`, `search`, `invoke`, `terminate`).

**Fluent rendering is in core** — `ecp.encode(...).as("fluent")`; there is no `@executioncontrolprotocol/format-fluent` extension.

### Commands

```sh
npm install
npm run build
npm run generate:schema   # writes packages/types/dist/schemas/*.json
npm run check    # build + generate:schema + lint + test:unit + test:integration + test:e2e
npm run test:unit
npm run test:eval      # full harness matrix (Ollama gemma3:1b; chat + legacy cases; skips when unavailable)
npm run eval:harness   # alias for test:eval:matrix
```

Harness eval profile is baked in `packages/evals/src/profiles/ollama-gemma.ts` (not `OLLAMA_MODEL` env).

### CLI

Oclif v4 (`@oclif/core`). Commands live in `packages/cli/src/commands/`; build with `npm run build` before `npm link` or tests.

```sh
ecp run examples/01-echo/workflow.ts --env examples/01-echo/environment.ts
ecp validate examples/01-echo/workflow.ts --env examples/01-echo/environment.ts
ecp compile examples/01-echo/workflow.ts -o /tmp/workflow.json
ecp describe --env examples/01-echo/environment.ts
ecp search "echo" --env examples/01-echo/environment.ts
ecp encode workflow.json --format toon --env examples/01-echo/environment.ts -o workflow.toon
ecp decode workflow.toon --format toon --env examples/01-echo/environment.ts -o workflow.json
ecp encode workflow.json --format fluent --env examples/01-echo/environment.ts -o workflow.generated.ts
ecp run --help
```

### Operational instance (`env.init()`)

`await env.init()` returns an **`Ecp`** instance for all operational APIs: `run`, `encode`, `decode`, `patch`, `validate`, `describe`, `search`, and `invoke` (when implemented). Lifecycle: `environment:configuring` → bind extensions → `environment:ready`. Call `ecp.terminate()` to emit `environment:terminate`.

### Environment encoding, decoding, and patch

Utility operations do not emit run/step lifecycle hooks.

- Results use **`@executioncontrolprotocol.encode.result`** / **`@executioncontrolprotocol.decode.result`** / **`@executioncontrolprotocol.patch.result`** with `success`, **`.result`**, `validation`, and `diagnostics` (not `.content` / `.document`).
- `ecp.encode(source).uses("@executioncontrolprotocol/format-toon").to("@executioncontrolprotocol.workflow").with({ headers: false }).process()`
- `ecp.decode(input).uses("@executioncontrolprotocol/format-toon").to("@executioncontrolprotocol.patch").process()` — decode input field is **`input`** in `EcpDecodeInput` payloads to extensions.
- `ecp.patch(manifest).with(patchDocOrShorthand).process()` — patch paths use **`steps[<stepId>].field`** (globally unique step IDs; `WorkflowBuilder.toManifest()` assigns unique IDs).
- Omit `.uses(...)` for canonical JSON passthrough.
- **Fluent authoring (core):** `workflow(...).toManifest()` / `compileWorkflowSource` (Fluent/TS → manifest); `renderWorkflowToFluent` / `workflow(...).toFluentSource()` / `ecp.encode(...).as("fluent")` (manifest → Fluent source). No `@executioncontrolprotocol/format-fluent` extension.
- **TOON (extension):** `@executioncontrolprotocol/format-toon` via `.uses("@executioncontrolprotocol/format-toon")`; `headers` / `compact` options; validates workflow, environment, `@executioncontrolprotocol.patch`.
- MCP tools: `ecp.encode`, `ecp.decode` on `createEcpMcpServer`

### Extension catalog and binding

Extension packages call `catalogExtension(def)` at module load. **Examples use string bindings:** `extension("@executioncontrolprotocol/format-toon").with({})` after `import "@executioncontrolprotocol/format-toon"` (catalog lookup). For the in-repo stub, `import "@executioncontrolprotocol/core/testing"` then `extension("@executioncontrolprotocol/test").with({})`.

`ensureBoundExtensionsRegistered()` runs automatically before `encode`, `decode`, `describe`, and `run` — no separate `await register*()` in environment modules when the package catalogs on import.

### Extension authoring (third-party parity)

Built-in packages under `packages/extensions/` follow the same rules as external extension authors. See [`.cursor/rules/extensions.mdc`](.cursor/rules/extensions.mdc).

| Do | Don't |
| ---- | ----- |
| Depend on `@executioncontrolprotocol/types` + `@executioncontrolprotocol/core` (+ focused third-party libs) | Import `@executioncontrolprotocol/node`, `@executioncontrolprotocol/browser`, `@executioncontrolprotocol/cli`, or `@executioncontrolprotocol/mcp` from an extension package |
| `catalogExtension(def)` on package load; optional `register*Extension(registry?)` | Call `describe()` / `run()` or require a host runtime inside extension tests |
| Test with document **fixtures** and `environment()` from `@executioncontrolprotocol/core` for encode/decode | Pull in `nodeEnvironment()` to build discovery payloads |

**Apps and examples** compose extensions in `environment.ts` using `@executioncontrolprotocol/node` or `@executioncontrolprotocol/browser` — that host layer is separate from extension package code.

Local dev: `npm start -w @executioncontrolprotocol/cli` (runs `bin/dev.js` after build).

### Fluent API quickstart

```ts
import { workflow, step } from "@executioncontrolprotocol/core"
import { environment, extension } from "@executioncontrolprotocol/node"
import "@executioncontrolprotocol/core/testing"

const manifest = workflow("My flow")
  .run([step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hi" }).as("echo")])
  .toManifest()
// Manifest steps use the same verbs as the fluent API: `.as("echo")` → `as: "echo"`; optional `{ mode }` → `mode: "create" | ...`

const env = (await environment("dev")).withExtensions([extension("@executioncontrolprotocol/test").with({})])
const ecp = await env.init()
await ecp.run(manifest)
```

### Browser

Browser demo: [executioncontrolprotocol-browser-demo](https://github.com/GuillaumeCleme/executioncontrolprotocol-browser-demo) (standalone repo; uses `@executioncontrolprotocol/*` from npm or `npm link`).

**Browser demo chat:** FAQ and assistant replies must come from the bound model provider via `@executioncontrolprotocol/harness-browser-nano` (`workflow-assistant` task). Do not route user-facing chat through template capabilities (`@executioncontrolprotocol/browser.guideChat`) or other non-model stand-ins. Browser demo defaults to **Chrome AI** (`@executioncontrolprotocol/chrome-ai.generate`); browser demo and eval matrix share **`HARNESS_NANO_BINDING`** (EQL outputs for intent, workflow, and assistant). The demo app may override the provider via `.uses(...)` at invoke.

**Mechanism vs policy:** `@executioncontrolprotocol/browser-registry` handles freeze, `globalThis.ecp`, and auto-bind. **`@executioncontrolprotocol/registry-control`** (bound as a policy) authorizes dynamic extension registration via `policy:pre` and `registryRequest` on the policy context.

```ts
import { environment, workflow, step, extension, policy } from "@executioncontrolprotocol/browser"

const env = await environment("demo") // binds registry-control + browser-registry (global `ecp`)

const ecp = await env.init()
await globalThis.ecp.registerExtension(customerExtension)

await ecp.run(workflow)
```

**Lifecycle:** `init()` emits `environment:created`, `environment:configuring`, and `environment:ready`. `run()` emits `environment:beforeRun`. Registry freeze is configured with **`freezeOn`**: `"environment:ready"` | `"environment:beforeRun"` | `"manual"` (default in demo: `"environment:beforeRun"`).

**Tests:**

```sh
npm run test:browser:install   # once per machine
npm run test:browser           # Vitest browser project (Chromium); separate from test:unit
```

CI runs the `browser` job in `.github/workflows/ci-pipeline.yml` (not part of `npm run check`).

Build order: `tsc -b tsconfig.build.json` (types → core → … → cli).

### Harness authoring surface

Reusable harness helpers are exported from `@executioncontrolprotocol/core`: `defineHarness`, `runModelRepairLoop`, `buildSystemPrompt`, `summarizeEnvironmentDescriptor`, `formatStructuredRepairForModel`, `buildAssistantSafeReply`, etc. Shared task input Zod schemas live in `@executioncontrolprotocol/types` (`HARNESS_TASK_IDS`, `harnessWorkflowAssistantInputSchema`, …).

| Harness | Package | Id | Model surface | Eval profile |
| ------- | ------- | -- | ------------- | ------------ |
| Browser Nano | `@executioncontrolprotocol/harnesses-browser-nano` | `@executioncontrolprotocol/harness-browser-nano` | EQL multi-shot **chat** orchestrator | `ollama-gemma-1b` (`gemma3:1b`) — demo + `npm run eval:matrix` |
| Browser Coding | `@executioncontrolprotocol/harnesses-browser-coding` | `@executioncontrolprotocol/harness-browser-coding` | TypeScript (Fluent + typed intent/reply) | `ollama-qwen-coder-1.5b` (`qwen2.5-coder:1.5b`) — `npm run eval:matrix:coding` only |

`compileHarnessArtifactSource` in `@executioncontrolprotocol/core/compile` evaluates intent/reply TS modules. Workflow create/patch use `compileWorkflowSource`. The **`workflow-assistant`** task is the unified assistant (ECP FAQ, identity, environment help, run Q&A). Optional `identity: true` on prompt fixtures prepends `ECP_ASSISTANT_IDENTITY_PRIMER`.

### Harness eval integrity

- Do not delete, skip, or weaken **valid** failing matrix/smoke eval tests to green CI.
- Do not fail-open quality gates (`@executioncontrolprotocol/ollama.evaluate` judge, schema validation) on errors.
- Triage harness prompts vs model vs fixture before changing assertions. Harness prompts: `packages/harnesses/*/fixtures/harness-prompts/`; eval framework: `@executioncontrolprotocol/evals`; eval cases: `packages/harnesses/*/fixtures/eval-cases/`.
