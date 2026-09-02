# @executioncontrolprotocol/browser

**Browser runtime host** for ECP: in-browser executor, registry extensions, session/local config, and helpers to initialize `Ecp` in a web page.

This is **not** the browser demo application. UI, provider picker, harness selection, and demo-only persistence belong in the standalone [browser demo repo](https://github.com/executioncontrolprotocol/browser-demo).

## What belongs here

| In `@executioncontrolprotocol/browser` | In the browser demo app (or your app) |
| ----------------- | ------------------------------------- |
| Browser runtime executor | React/Vite shell, chat layout, panels |
| `browser-registry`, session/local config | First-run modal, provider + harness mode UI |
| `createEcp()`, `installBrowserWorkflowShim()` | Monaco, Mermaid viewer, CSS |
| `registerBrowserHost()` / slim `createBrowserEnvironment()` | Binding formats, model providers, **harnesses** |
| Panel encode helper (`BrowserAuthoringService`) | Which harness + `providerCapabilityId` to invoke |

**Do not add demo-app UI types here** (e.g. `ProviderMode` unions). Those stay in the demo app.

**Harness-independent:** this package does not depend on `@executioncontrolprotocol/harnesses-browser-nano` or coding harnesses. Apps register and bind harnesses themselves.

## Host registration

```ts
import { registerBrowserHost, createBrowserEnvironment, createEcp } from "@executioncontrolprotocol/browser"

await registerBrowserHost()
const env = createBrowserEnvironment("my-app")
// App adds extensions / harnesses / policies as needed:
// env.addExtensionBinding(...); env.withHarnesses([...])
const ecp = await createEcp(env, { exposeGlobal: true })
```

`registerBrowserDefaults` / `createBrowserDemoEnvironment` remain as deprecated aliases of the slim host APIs.

## Compile-on-edit

Use **`@executioncontrolprotocol/core/browser`** for `compileWorkflowSource` / `compileHarnessArtifactSource` (not this package). Call **`installBrowserWorkflowShim()`** before compile so Fluent source can use `@executioncontrolprotocol/browser` imports or the injected shim.

## Dependencies

This package depends on `@executioncontrolprotocol/core`, `@executioncontrolprotocol/types`, `@executioncontrolprotocol/policies`, and `@executioncontrolprotocol/browser-secrets`. Model providers, format extensions, and harnesses are **app** dependencies.

## Tests

```sh
pnpm run test:browser:install   # once
pnpm run test:browser
```

See [AGENTS.md](../../AGENTS.md) and the [browser demo repo](https://github.com/executioncontrolprotocol/browser-demo).
