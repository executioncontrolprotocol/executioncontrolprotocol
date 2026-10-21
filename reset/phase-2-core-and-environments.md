# Phase 2 — Consolidate core and environments

> Status: Planned · Branch: `feat/phase-2-core-and-environments` · Depends on: Phase 1 ·
> Plan: §4.1, §4.4, §8.1

## Goal

Turn `core` into a small, environment-agnostic engine, and turn today's runtimes into
environments that take the same `.with([...])` bindings as workflows. After this phase the
object model matches the plan, even though the CLI and workflow files still work the old way.

## Scope

**In:**

- Folding `types` and `registry-control` into core.
- Moving `runtimes/*` to `environments/*` and `defineRuntime` to `defineEnvironment`.
- `environment(id).with([...])`.
- `.supports()` on definitions.
- Making definitions plain data.
- Moving Node-only and browser-only host code out of core.

**Out:**

- Workflow `.with([...])` and `.requires()` (Phase 4).
- Splitting `budget`, `approval` and `state-control` into plugins (Phase 5). They stay in
  `packages/policies` until then.
- Any CLI changes beyond keeping it compiling.

## Tasks

### 1. Fold `types` into core

- Move `packages/types/src/*` to `packages/core/src/types/` and `scripts/generate-schemas.mjs`
  to `packages/core/scripts/`.
- Add the `./types` export to core. Keep the generated JSON Schemas in
  `core/dist/schemas`, with the same schema ids (`@executioncontrolprotocol.workflow` v1.0
  etc.).
- Codemod every `@executioncontrolprotocol/types` import in the repo to
  `@executioncontrolprotocol/core/types`.
- Delete `packages/types`. The root `generate:schema` script now filters to core.

### 2. Move `registry-control` into core

- Move `policies/src/registry-control.ts` and its test to `core/src/policies/registry-control.ts`.
- Every environment binds it implicitly. Phase 3 configures it from the CLI's trust settings.
- `packages/policies` keeps `budget`, `approval` and `state-control` for now.
- Core's `MISSING_STATE_CONTROL_POLICY` check stays, but its message must name the policy
  plugin (`@executioncontrolprotocol/state-control`), because core no longer ships that policy.

### 3. Runtimes become environments

- `defineRuntime` → `defineEnvironment`; `RuntimeDefinition` → `EnvironmentDefinition`;
  `RuntimeBindingBuilder` and `runtime()` are removed.
- Move `packages/runtimes/node` to `packages/environments/node` and `packages/runtimes/browser`
  to `packages/environments/browser`. Package names are unchanged (`@executioncontrolprotocol/node`,
  `@executioncontrolprotocol/browser`) and are also the environment ids (`NODE_RUNTIME_ID` and
  `BROWSER_RUNTIME_ID` become `NODE_ENVIRONMENT_ID` and `BROWSER_ENVIRONMENT_ID`).
- An environment definition owns its executor (`node-executor`, `browser-executor`), its
  builtins, and its host stores.
- `pnpm-workspace.yaml`: replace `packages/runtimes/*` with `packages/environments/*`.

### 4. One binding API: `environment(id).with([...])`

Target signature:

```ts
environment(id: EnvironmentId, label?: string)
  .with(bindings: Array<ExtensionBindingBuilder | PolicyBindingBuilder>)
  .init(options?: { blobStore?, artifactStore?, remoteInvoke?, registry? }) // → Ecp
```

- `id` is now the environment definition id (`@executioncontrolprotocol/node`), not a
  free-form name. The old free-form name becomes the optional `label`.
- Remove `withExtensions`, `withPolicies`, `withRuntime` (and `withHarnesses`, removed in
  Phase 1).
- `withBlobStore`, `withArtifactStore` and `withRemoteInvoke` have one caller each today. They
  become `init()` options for apps that embed core. The environment definition supplies
  defaults.
- Codemod the call sites. Before this phase there are about 48 `withExtensions`, 21
  `withRuntime` and 8 `withPolicies` call sites across packages, tests and examples.

### 5. `.supports()` replaces `withSupportedRuntimes`

- Add `.supports(environmentId, range?)` to the extension and policy definition builders. It
  can be called several times; no call means "any environment".
- Replace `withSupportedRuntimes([...])` in the files that still use it after Phase 1: core's
  definition builder and its test, `anthropic` (Node and browser), `openai`, `ollama`, `fal`,
  `image-sharp`, `adobe-firefly-services` (Node), `secrets`, `process-env`, and
  `browser-local-config`.
- Validation code `UNSUPPORTED_RUNTIME_EXTENSION` becomes `ECP_ENVIRONMENT_UNSUPPORTED`. It
  names the extension, the current environment, and the environments the extension supports.
- `range` is checked against the environment package's version with `semver`.

### 6. Definitions are data

- Remove `catalogExtension()` and module-level `globalRegistry` registration. About 48 source
  files call one or both today, mostly the `register*Extension()` helpers in each extension.
- Each environment instance owns its `Registry`. `globalRegistry` stays only as a deprecated
  default for tests, and is removed in Phase 3 once the CLI host exists.
- Examples and tests stop importing extension packages for side effects. They import the
  definition and bind it: `extension(jsonataExtension)`. Phase 4 replaces this with string ids
  resolved from installed plugins.

### 7. Secrets providers move into the Node environment

- Move `extensions/secrets` and `extensions/process-env` into
  `environments/node/src/secrets/`.
- The Node environment definition binds both by default, so `secrets("…")` and `env("…")`
  work with no explicit binding.
- Delete the two packages.
- `process-env` has no tests today. Add tests for set, unset and optional values.

### 8. Move host code out of core

Core's root entry must not import `node:*` or touch the DOM. Today core has `./node`,
`./browser`, `./loaders` and `./compile` entries containing host code:

| Today | Moves to |
| --- | --- |
| `core/src/node.ts`, `loaders/*`, `compile/transpile.ts` and the esbuild bundling, Node file and media writing | `@executioncontrolprotocol/node` |
| `core/src/browser.ts`, `browser-runtime-entry.ts`, `compile/*browser*`, `transpile-browser.ts` | `@executioncontrolprotocol/browser` |
| Pure compile helpers (`extract-workflow-module.ts`, `evaluate.ts` minus host bits) | Stay in core |

Then:

- Core's `exports` become `.` and `./types`.
- Add an ESLint `no-restricted-imports` rule for `node:*` (and `fs`, `path`, `child_process`)
  in `packages/core/src/**`.
- Run core's unit tests in both the Node Vitest project and the browser project.

## Tests and verification

- The existing core suites (runtime, store mutation, lifecycle, registry freeze, validation,
  encoding, patch, describe, search) pass after the codemods, with no behaviour change.
- New tests:
  - `environment(id).with([...])`: extension and policy bindings, labels.
  - `.supports()`: no call, one environment, several environments, version range mismatch,
    and the `ECP_ENVIRONMENT_UNSUPPORTED` payload.
  - Registry isolation: two environments in one process don't share registrations.
  - Node environment: `secrets()` and `env()` resolve with no explicit binding.
  - Lint: a deliberate `node:fs` import in core fails lint (run once to prove the rule, then
    remove).
- `pnpm run check` passes.

## Exit criteria

- [ ] `packages/types`, `packages/runtimes`, `extensions/secrets`, `extensions/process-env`
      are gone; `packages/environments/{node,browser}` exist with unchanged package names.
- [ ] Core exports only `.` and `./types`, has no Node-only imports, and is about 12K lines.
- [ ] No `withExtensions`, `withPolicies`, `withRuntime`, `runtime()`, `defineRuntime`,
      `withSupportedRuntimes`, or `catalogExtension` calls remain.
- [ ] Core tests are green in Node and in the browser project.
- [ ] Phase status updated in `reset/README.md` and `RESET-PLAN.md` §7.

## Risks

| Risk | Mitigation |
| --- | --- |
| The `types` codemod touches every package and conflicts with parallel work | Do it first, in its own commit, and don't run other phases in parallel with Phase 2 |
| Removing `globalRegistry` breaks tests that relied on implicit registration | Keep a deprecated `globalRegistry` until Phase 3, and migrate tests package by package |
| Moving compile and transpile out of core breaks the browser path | The browser package keeps its own `transpile-browser`. Core keeps only pure helpers. The browser test project catches regressions |
