# @executioncontrolprotocol/browser

**Browser environment** for ECP: in-browser executor, registry and local-config extensions, esbuild-wasm workflow compile, and helpers to initialize `Ecp` in a web page.

This is **not** a demo application. UI belongs in an app. The former `apps/browser-demo` was removed in Phase 1 and returns as `packages/app` in Phase 8.

## What belongs here

| In `@executioncontrolprotocol/browser` | In an embedding app |
| ----------------- | ------------------------------------- |
| Browser environment executor | React/Vite shell, chat layout, panels |
| `browser-registry`, `browser-local-config` | First-run UI, provider picker |
| `createBrowserEnvironment()`, `createEcp()`, `installBrowserWorkflowShim()` | Editors, graph viewers, CSS |
| `compileWorkflowSource` (esbuild-wasm) | Binding formats and model providers |

There is no secrets provider in this package (`browser-secrets` was removed in Phase 1). Workflows that need secrets run through the CLI / Node environment.

## Typical usage

```ts
import {
  BROWSER_ENVIRONMENT_ID,
  createBrowserEnvironment,
  createEcp,
} from "@executioncontrolprotocol/browser"

const env = createBrowserEnvironment(BROWSER_ENVIRONMENT_ID, "my-app")
const ecp = await createEcp(env, { exposeGlobal: true })
```

`createBrowserEnvironment` binds `browser-registry`, `browser-local-config`, and
`registry-control` with a namespace allow-list. Override that config with
`.with([policy(registryControlPolicy).with({ ... })])`.

## Dependencies

This package depends on `@executioncontrolprotocol/core`. Protocol types come from
`@executioncontrolprotocol/core/types`. Model providers and format extensions are **app**
dependencies.

## Tests

```sh
pnpm run test:browser
```
