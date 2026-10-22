# @executioncontrolprotocol/browser

**Browser runtime host** for ECP: in-browser executor, registry and local-config extensions, and helpers to initialize `Ecp` in a web page.

This is **not** a demo application. UI belongs in an app. The former `apps/browser-demo` was removed in Phase 1 and returns as `packages/app` in Phase 8.

## What belongs here

| In `@executioncontrolprotocol/browser` | In an embedding app |
| ----------------- | ------------------------------------- |
| Browser runtime executor | React/Vite shell, chat layout, panels |
| `browser-registry`, `browser-local-config` | First-run UI, provider picker |
| `createEcp()`, `installBrowserWorkflowShim()` | Editors, graph viewers, CSS |
| `registerBrowserHost()` / slim `createBrowserEnvironment()` | Binding formats and model providers |

There is no secrets provider in this package (`browser-secrets` was removed in Phase 1). Workflows that need secrets run through the CLI / Node environment.

## Host registration

```ts
import { registerBrowserHost, createBrowserEnvironment, createEcp } from "@executioncontrolprotocol/browser"

await registerBrowserHost()
const env = createBrowserEnvironment("my-app")
const ecp = await createEcp(env, { exposeGlobal: true })
```

`registerBrowserDefaults` / `createBrowserDemoEnvironment` remain as aliases of the slim host APIs.

## Compile-on-edit

Use **`@executioncontrolprotocol/core/browser`** for `compileWorkflowSource` (not this package). Call **`installBrowserWorkflowShim()`** before compile so Fluent source can use `@executioncontrolprotocol/browser` imports or the injected shim.

## Dependencies

This package depends on `@executioncontrolprotocol/core`, `@executioncontrolprotocol/types`, and `@executioncontrolprotocol/policies`. Model providers and format extensions are **app** dependencies.

## Tests

```sh
pnpm run test:browser:install   # once
pnpm run test:browser
```

See [AGENTS.md](../../../AGENTS.md).
