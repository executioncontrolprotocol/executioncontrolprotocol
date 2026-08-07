# ECP browser review

Coding-agent-ready plan split into two tracks:

1. **Validation plan** for the implementation we just defined.
2. **Full implementation plan** for dynamic browser extension registration.

This assumes the latest decisions are source of truth: `@executioncontrolprotocol/browser` includes the browser runtime; `@executioncontrolprotocol/node` replaces the old local runtime; browser-specific behavior is implemented through normal ECP extensions, not a new plugin concept; and `state()` mutations remain staged and policy-validated. The existing implementation already has the core fluent API, environment model, registry, `state()`, lifecycle, policies, and runtime internals that we are building on.

---

# Part 1: Validation plan for the implementation

## 1. Validation goals

The implementation should prove five things:

| Goal                              | What we need to prove                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Package split is correct          | `@executioncontrolprotocol/core`, `@executioncontrolprotocol/browser`, and `@executioncontrolprotocol/node` have clean boundaries. |
| Runtime model is correct          | Browser and Node runtimes share core execution behavior but expose platform-specific defaults.                                     |
| Environment lifecycle works       | Environment hooks fire in the right order and can be used by hook-only extensions.                                                 |
| Dynamic registry is safe          | Extensions can register dynamically only when allowed, and freeze behavior is enforced.                                            |
| `state()` behavior remains intact | Store mutations are staged, policy-checked, and committed transactionally with `.as()` output.                                     |

---

# 2. Package boundary validation

## 2.1 `@executioncontrolprotocol/core`

Validate that `@executioncontrolprotocol/core` is platform-neutral.

### Core package must pass

```txt
@executioncontrolprotocol/core must not import:
- fs
- path
- os
- process
- keytar
- window
- document
- localStorage
- IndexedDB
- MCP SDK
- Temporal SDK
- Oclif
```

### Suggested checks

Add a static import boundary test:

```ts
describe("@executioncontrolprotocol/core package boundary", () => {
  it("does not import Node, browser, CLI, MCP, or Temporal-only modules", async () => {
    const forbidden = [
      "fs",
      "path",
      "os",
      "keytar",
      "@modelcontextprotocol",
      "@temporalio",
      "@oclif",
    ];

    const imports = await scanPackageImports("packages/core/src");

    for (const mod of forbidden) {
      expect(imports).not.toContain(mod);
    }
  });
});
```

## 2.2 `@executioncontrolprotocol/browser`

Validate that `@executioncontrolprotocol/browser` imports cleanly in a real browser bundle.

### Browser package must pass

```txt
- Vite build succeeds
- no Node polyfills required
- environment() is exported
- workflow(), step(), ref(), state(), extension(), runtime(), policy() are exported
- @executioncontrolprotocol/browser runtime is registered by registerBrowserDefaults()
```

### Smoke test

```ts
import {
  environment,
  workflow,
  step,
  runtime,
  registerBrowserDefaults,
} from "@executioncontrolprotocol/browser";

registerBrowserDefaults();

const wf = workflow("Browser Echo")
  .run([
    step("@executioncontrolprotocol/test.echo", "Echo")
      .with({ message: "Hello browser" })
      .as("echo"),
  ])
  .toManifest();

const result = await environment("browser-demo")
  .withRuntime(runtime("@executioncontrolprotocol/browser").with({}))
  .run(wf);

expect(result.state?.echo).toEqual({ message: "Hello browser" });
```

## 2.3 `@executioncontrolprotocol/node`

Validate that `@executioncontrolprotocol/node` replaces the old local runtime.

### Node package must pass

```txt
- NODE_RUNTIME_ID === "@executioncontrolprotocol/node"
- registerNodeRuntime() registers @executioncontrolprotocol/node
- CLI defaults to @executioncontrolprotocol/node
- no remaining @executioncontrolprotocol/local references
- no LocalRuntimeExecutor references except deleted/migration notes
```

### Search checks

```bash
rg "@executioncontrolprotocol/local|LocalRuntimeExecutor|registerLocalRuntime|LOCAL_RUNTIME_ID" packages
```

Expected result: **no source references**.

---

# 3. Runtime behavior validation

## 3.1 Shared execution engine

Validate that Node and browser runtimes both use the shared in-memory executor.

### Runtime conformance must pass

| Test               | Expected                                      |
| ------------------ | --------------------------------------------- |
| sequence execution | steps execute in order                        |
| `.as()` commit     | output lands in state key                     |
| no `.as()`         | output only appears in run history            |
| branch             | only matching branch executes                 |
| loop               | loop exits on condition or max rounds         |
| parallel           | branches execute and commit outputs           |
| policy deny        | step does not commit                          |
| capability throw   | step fails and staged mutations are discarded |

### Shared test suite

Create a shared runtime conformance test:

```txt
packages/core/test/runtime-conformance.ts
```

Run it against:

```txt
@executioncontrolprotocol/node
@executioncontrolprotocol/browser
```

Example structure:

```ts
export function runtimeConformanceSuite(createEnv: () => Environment) {
  describe("runtime conformance", () => {
    it("commits step output through .as()", async () => {});
    it("keeps uncommitted output in run history only", async () => {});
    it("executes loops", async () => {});
    it("executes branches", async () => {});
    it("handles policy pre-deny", async () => {});
    it("discards staged mutations on failure", async () => {});
  });
}
```

---

# 4. Environment lifecycle validation

We are adding environment lifecycle events into the same lifecycle model:

```txt
environment:created
environment:configuring
environment:ready
environment:beforeRun
environment:shutdown
```

The previous lifecycle already included run, step, and policy scopes, with public lifecycle hooks limited to those scopes. We are now adding environment as the fourth lifecycle scope, while keeping state mutation events internal/audit-only.

## 4.1 Event ordering test

### Environment lifecycle ordering test

```ts
it("fires environment lifecycle events in order", async () => {
  const events: string[] = [];

  const testExtension = defineExtension("@test", "env-hooks")
    .withHooks([
      hook("environment:created", () => events.push("environment:created")),
      hook("environment:configuring", () => events.push("environment:configuring")),
      hook("environment:ready", () => events.push("environment:ready")),
      hook("environment:beforeRun", () => events.push("environment:beforeRun")),
      hook("environment:shutdown", () => events.push("environment:shutdown")),
    ])
    .build();

  const env = environment("test")
    .withExtensions([
      extension(testExtension).with({}),
    ]);

  await env.ready?.();

  await env.run(simpleWorkflow);

  await env.shutdown?.();

  expect(events).toEqual([
    "environment:created",
    "environment:configuring",
    "environment:ready",
    "environment:beforeRun",
    "environment:shutdown",
  ]);
});
```

Implementation detail: if `environment:created` fires before extensions are bound, it may not be observable by extension hooks. In that case, either remove it from hook-target events or define it as a runtime/internal event. My recommendation is:

> Make `environment:created` an internal runtime event, and make `environment:configuring`, `environment:ready`, `environment:beforeRun`, and `environment:shutdown` extension-hookable.

This avoids an awkward event that hook-only extensions cannot observe because they are not bound yet.

## 4.2 Recommended final environment hook list

Use these as public extension hook targets:

```ts
export type EnvironmentLifecycleEvent =
  | "environment:configuring"
  | "environment:ready"
  | "environment:beforeRun"
  | "environment:shutdown";
```

Keep `environment:created` internal/observable in logs only.

---

# 5. `state()` mutation validation

This is mandatory because the browser runtime must preserve the latest state model.

The `state()` source-of-truth says that `state()` resolves to a mutable handle, `ref()` resolves to a raw committed value, store writes require `state()` handles, mutations are staged, policies inspect them, and staged mutations plus `.as()` output commit transactionally.

## 5.1 Store write requires `state()` handle

### State handle requirement test

```ts
it("rejects store writes with raw string paths", async () => {
  const badCapability = capabilityFor("@test/bad", "writeRaw")
    .withInput(z.object({}))
    .withOutput(z.object({ ok: z.boolean() }))
    .withHandler(async (_, ctx) => {
      await ctx.store.merge("creativeInputs" as any, { prompt: "bad" });
      return { ok: true };
    });

  const result = await env.run(workflowUsingBadCapability);

  expect(result.run.status).toBe("failed");
  expect(result.state?.creativeInputs).toBeUndefined();
});
```

## 5.2 Mutations are staged until `policy:post`

### Staged mutations test

```ts
it("does not expose staged mutations as committed state before policy post", async () => {
  const seen: unknown[] = [];

  const testPolicy = definePolicy("@test", "inspect")
    .withHooks([
      hook("policy:post", (ctx) => {
        seen.push({
          state: ctx.state,
          pendingMutations: ctx.pendingMutations,
          proposedState: ctx.proposedState,
        });
      }),
    ])
    .build();

  await env.run(workflowWithStateMutation);

  expect(seen[0].state.creativeInputs).toBeUndefined();
  expect(seen[0].pendingMutations).toHaveLength(1);
  expect(seen[0].proposedState.creativeInputs).toBeDefined();
});
```

## 5.3 Policy denial prevents mutation and `.as()` commit

### Policy post denial test

```ts
it("denies both pending mutations and .as() commit when policy:post denies", async () => {
  const denyPolicy = definePolicy("@test", "deny-post")
    .withHooks([
      hook("policy:post", () => ({
        type: "deny",
        reason: "No mutation allowed",
      })),
    ])
    .build();

  const result = await env.run(workflowWithMutationAndAsCommit);

  expect(result.run.status).toBe("failed");
  expect(result.state?.creativeInputs).toBeUndefined();
  expect(result.state?.fix).toBeUndefined();
});
```

## 5.4 Capability failure discards mutations

### Capability failure mutation test

```ts
it("discards staged mutations when capability throws", async () => {
  const result = await env.run(workflowWhereCapabilityMutatesThenThrows);

  expect(result.run.status).toBe("failed");
  expect(result.state?.creativeInputs).toBeUndefined();
});
```

---

# 6. Config resolver validation

The browser and node config/secrets extensions depend on `$env` resolving through extension-provided resolvers.

## 6.1 Resolver order

### Config resolver order test

```ts
it("resolves env values using extension binding order", async () => {
  const env = environment("config-order")
    .withExtensions([
      extension("@test/config-a").with({ value: "from-a" }),
      extension("@test/config-b").with({ value: "from-b" }),
    ]);

  const resolved = await env.resolveConfig("API_KEY");

  expect(resolved).toBe("from-a");
});
```

## 6.2 Fallback and optional behavior

```ts
env("MISSING", { fallback: "fallback" }) // resolves fallback
env("MISSING", { optional: true })       // resolves undefined
env("MISSING")                          // error
```

## 6.3 Secret serialization

Validate secret values do not appear in:

```txt
- environment manifests
- environment descriptors
- run results
- run history
- logs
- validation errors
```

### Secret serialization test

```ts
it("does not serialize resolved secrets", async () => {
  sessionConfig.set("OPENAI_API_KEY", "sk-test-secret");

  const descriptor = await env.describe();
  const manifest = env.compile();
  const result = await env.run(workflow);

  const serialized = JSON.stringify({ descriptor, manifest, result });

  expect(serialized).not.toContain("sk-test-secret");
});
```

---

# 7. Browser runtime validation

## 7.1 Browser import test

Use Vite or Playwright.

```txt
apps/browser-smoke-test/
```

Test:

```ts
import * as ECP from "@executioncontrolprotocol/browser";

expect(ECP.environment).toBeDefined();
expect(ECP.workflow).toBeDefined();
expect(ECP.registerBrowserDefaults).toBeDefined();
```

## 7.2 No Node polyfills

Build should fail if Node polyfills are required.

Vite config:

```ts
resolve: {
  alias: {
    fs: false,
    path: false,
    os: false,
  },
}
```

## 7.3 Browser runtime conformance

Run the shared runtime conformance suite in browser mode.

---

# 8. Node runtime validation

## 8.1 Process env extension

### Process env resolver test

```ts
it("resolves env() from process.env", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  const env = environment("node")
    .withRuntime(runtime("@executioncontrolprotocol/node").with({}))
    .withExtensions([
      extension("@executioncontrolprotocol/process-env").with({
        allowedKeys: ["OPENAI_API_KEY"],
      }),
    ]);

  const resolved = await env.resolveConfig("OPENAI_API_KEY");

  expect(resolved).toBe("test-key");
});
```

## 8.2 Allowed/denied keys

```ts
allowedKeys: ["OPENAI_API_KEY"]
deniedKeys: ["SLACK_BOT_TOKEN"]
```

Validate denied wins.

## 8.3 Secrets extension

Mock the OS secrets provider.

```ts
const provider: SecretsProvider = {
  id: "mock",
  get: async (name) => name === "OPENAI_API_KEY" ? "secret-key" : undefined,
};
```

Assert:

```txt
- secrets resolver participates before process-env when ordered first
- missing secrets fall through to process-env
- denied secret keys are rejected
- values are never serialized
```

---

# Part 2: Full plan for dynamic browser extension registration

# 1. Objective

Implement a hook-only browser registry extension that allows browser-loaded JavaScript modules or scripts to register ECP extensions dynamically into an active browser environment, while supporting frozen registry state for security.

This must not introduce a new plugin system.

It must use existing ECP concepts:

```txt
defineExtension(...)
extension(...).with(...)
withExtensions([...])
hook(...)
environment lifecycle events
```

---

# 2. Target developer experience

## 2.1 Browser app setup

```ts
import {
  environment,
  runtime,
  extension,
  policy,
  registerBrowserDefaults,
} from "@executioncontrolprotocol/browser";

registerBrowserDefaults();

const env = environment("browser-demo")
  .withRuntime(runtime("@executioncontrolprotocol/browser").with({}))
  .withExtensions([
    extension("@executioncontrolprotocol/browser-registry", "Dynamic Registry").with({
      frozen: false,
      freezeOnFirstRun: true,
      allowRuntimeRegistration: true,
      autoBindRegisteredExtensions: true,
      allowedNamespaces: ["@customer/*"],
      exposeGlobal: true,
      globalName: "ECP",
    }),
  ])
  .withPolicies([
    policy("@executioncontrolprotocol/state-control").with({
      allowedMutablePaths: ["creativeInputs"],
      allowedMutationOps: ["set", "replace", "merge", "append"],
      requireReason: true,
    }),
  ]);
```

## 2.2 Dynamic module registration

```ts
import { defineExtension, capability } from "@executioncontrolprotocol/browser";

const customerExtension = defineExtension("@customer", "image-tools")
  .withCapabilities([
    capability("caption")
      .withInput(CaptionInput)
      .withOutput(CaptionOutput)
      .withHandler(async (input) => {
        return { caption: `Caption for ${input.asset}` };
      }),
  ])
  .build();

env.getRegistry().registerExtension(customerExtension);
```

## 2.3 Script-tag registration

```html
<script type="module">
  import { customerExtension } from "./customer-extension.js";

  window.ECP.registerExtension(customerExtension);
</script>
```

## 2.4 Search reflects dynamic capability

```ts
const results = await env.search("caption image");

expect(results.results[0].id).toBe("@customer/image-tools.caption");
```

---

# 3. Core registry changes

## 3.1 Add frozen state

Extend `Registry`.

```ts
export interface Registry {
  registerRuntime(def: RuntimeDefinition): void;
  registerExtension(def: ExtensionDefinition): void;
  registerPolicy(def: PolicyDefinition): void;

  freeze(reason?: string): void;
  isFrozen(): boolean;
}
```

Implementation:

```ts
class Registry {
  private frozen = false;
  private frozenReason?: string;

  freeze(reason = "Registry frozen") {
    this.frozen = true;
    this.frozenReason = reason;
  }

  isFrozen() {
    return this.frozen;
  }

  registerExtension(def: ExtensionDefinition) {
    this.assertCanRegister(def.id);
    // existing registration logic
  }

  private assertCanRegister(id: string) {
    if (this.frozen) {
      throw new RegistryFrozenError(id, this.frozenReason);
    }

    this.registrationGuard?.assertAllowed(id);
  }
}
```

## 3.2 Typed errors

Add:

```ts
export class RegistryFrozenError extends Error {
  code = "REGISTRY_FROZEN";

  constructor(id: string, reason?: string) {
    super(`Cannot register ${id}; registry is frozen${reason ? `: ${reason}` : ""}.`);
  }
}
```

```ts
export class RegistryRegistrationDeniedError extends Error {
  code = "REGISTRY_REGISTRATION_DENIED";

  constructor(id: string, reason?: string) {
    super(`Registration denied for ${id}${reason ? `: ${reason}` : ""}.`);
  }
}
```

## 3.3 Registration guard

Add optional guard:

```ts
export interface RegistryRegistrationGuard {
  assertAllowed(id: string, type: "extension" | "policy" | "runtime"): void;
}
```

Registry:

```ts
setRegistrationGuard(guard: RegistryRegistrationGuard): void;
```

The browser registry extension installs this guard.

---

# 4. Environment changes

## 4.1 Environment lifecycle support

Add hookable events:

```ts
export type EnvironmentLifecycleEvent =
  | "environment:configuring"
  | "environment:ready"
  | "environment:beforeRun"
  | "environment:shutdown";
```

## 4.2 Environment readiness

Implement an internal preparation phase.

```ts
class Environment {
  private prepared = false;

  async prepare() {
    if (this.prepared) return;

    await emitLifecycle("environment:configuring", this.context);
    await bindRuntimeExtensionsPolicies();
    await emitLifecycle("environment:ready", this.context);

    this.prepared = true;
  }

  async run(workflow, options) {
    await this.prepare();
    await emitLifecycle("environment:beforeRun", this.context);
    return this.runtime.execute(workflow, context);
  }

  async describe(query?) {
    await this.prepare();
    return buildDescriptor(...);
  }

  async search(query, options?) {
    await this.prepare();
    return searchCapabilities(...);
  }

  async shutdown() {
    await emitLifecycle("environment:shutdown", this.context);
  }
}
```

Important: If `environment:ready` freezes the registry, then `describe()` will cause freeze. For browser authoring, this is not ideal if we want dynamic registration before first run.

Recommendation:

```txt
- environment:configuring runs before describe/search/run
- environment:ready runs before run only, or explicit env.ready()
- freezeOnFirstRun happens in environment:beforeRun
```

So the better design is:

| Method           | Events                                                                  |
| ---------------- | ----------------------------------------------------------------------- |
| `env.describe()` | `environment:configuring` only                                          |
| `env.search()`   | `environment:configuring` only                                          |
| `env.validate()` | `environment:configuring` only                                          |
| `env.run()`      | `environment:configuring`, `environment:ready`, `environment:beforeRun` |

This lets a browser UI dynamically register extensions while authoring and still use `describe()`/`search()`.

## 4.3 Final lifecycle recommendation

```txt
environment:configuring
  fires lazily before describe/search/validate/run
  attaches dynamic registry/config services

environment:ready
  fires before first run or explicit env.ready()
  finalizes run-ready environment

environment:beforeRun
  fires before each run
  freezeOnFirstRun happens here

environment:shutdown
  explicit cleanup
```

---

# 5. Browser registry extension implementation

## 5.1 Package path

```txt
packages/runtimes/browser/src/extensions/browser-registry.ts
```

## 5.2 Extension definition

```ts
export const browserRegistryExtension = defineExtension("@executioncontrolprotocol", "browser-registry")
  .withConfig({
    frozen: boolean().default(false),
    freezeOnReady: boolean().default(false),
    freezeOnFirstRun: boolean().default(true),
    allowRuntimeRegistration: boolean().default(true),
    autoBindRegisteredExtensions: boolean().default(false),
    exposeGlobal: boolean().default(false),
    globalName: string().default("ECP"),
    allowedNamespaces: array(string()).default(["@customer/*"]),
    deniedNamespaces: array(string()).default([]),
  })
  .withHooks([
    hook("environment:configuring", attachBrowserRegistry),
    hook("environment:ready", maybeFreezeOnReady),
    hook("environment:beforeRun", maybeFreezeOnFirstRun),
    hook("environment:shutdown", detachBrowserRegistry),
  ])
  .build();
```

## 5.3 Config type

```ts
export interface BrowserRegistryConfig {
  frozen?: boolean;
  freezeOnReady?: boolean;
  freezeOnFirstRun?: boolean;
  allowRuntimeRegistration?: boolean;
  autoBindRegisteredExtensions?: boolean;
  exposeGlobal?: boolean;
  globalName?: string;
  allowedNamespaces?: string[];
  deniedNamespaces?: string[];
}
```

---

# 6. Namespace allow/deny

## 6.1 Matching rules

Support:

```txt
@executioncontrolprotocol/chrome-ai
@customer/*
@partner/*
```

Function:

```ts
function matchesNamespacePattern(id: string, pattern: string): boolean {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1);
    return id.startsWith(prefix);
  }

  return id === pattern || id.startsWith(`${pattern}.`);
}
```

Need to be careful with extension IDs and capability IDs:

| ID type    | Example                         |
| ---------- | ------------------------------- |
| Extension  | `@customer/image-tools`         |
| Capability | `@customer/image-tools.caption` |

For registration, validate extension ID only:

```txt
@customer/image-tools
```

## 6.2 Deny wins

```ts
function assertAllowed(id: string, config: BrowserRegistryConfig) {
  if (matchesAny(id, config.deniedNamespaces ?? [])) {
    throw new RegistryRegistrationDeniedError(id, "Denied by deniedNamespaces");
  }

  const allowed = config.allowedNamespaces ?? [];

  if (allowed.length > 0 && !matchesAny(id, allowed)) {
    throw new RegistryRegistrationDeniedError(id, "Not matched by allowedNamespaces");
  }
}
```

---

# 7. Global registration API

## 7.1 Global shape

```ts
export interface BrowserEcpGlobal {
  registerExtension(def: ExtensionDefinition): void;
  registerPolicy(def: PolicyDefinition): void;
  registerRuntime(def: RuntimeDefinition): void;
  freezeRegistry(reason?: string): void;
  isRegistryFrozen(): boolean;
  describeRegistry(): unknown;
}
```

## 7.2 Attach

```ts
function attachGlobal(env: Environment, config: BrowserRegistryConfig) {
  const name = config.globalName ?? "ECP";

  globalThis[name] = {
    registerExtension: (def) => env.getRegistry().registerExtension(def),
    registerPolicy: (def) => env.getRegistry().registerPolicy(def),
    registerRuntime: (def) => env.getRegistry().registerRuntime(def),
    freezeRegistry: (reason) => env.getRegistry().freeze(reason),
    isRegistryFrozen: () => env.getRegistry().isFrozen(),
    describeRegistry: () => env.getRegistry().describe?.() ?? {},
  };
}
```

## 7.3 Detach

At `environment:shutdown`:

```ts
delete globalThis[globalName];
```

Only delete if the extension created it. Do not delete a pre-existing global.

---

# 8. Auto-bind registered extensions

## 8.1 Problem

A registered extension definition is not automatically enabled in the environment.

For the browser demo, external scripts should be able to add an extension and immediately make its capabilities available.

## 8.2 Solution

When `autoBindRegisteredExtensions: true`, wrap registration:

```ts
env.getRegistry().onRegisterExtension((def) => {
  env.addExtensionBinding(
    extension(def.id).with({})
  );
});
```

If `addExtensionBinding` does not exist, add an internal environment method:

```ts
Environment.addExtensionBinding(binding: ExtensionBindingBuilder): void;
```

Guardrails:

```txt
- only auto-bind extensions, not policies/runtimes by default
- do not duplicate binding if already bound
- use empty config by default
- if extension config requires values, validation should catch missing config
```

## 8.3 Descriptor behavior

After auto-bind:

```ts
await env.describe()
```

must show:

```txt
- extension in extensions[]
- capabilities in capabilities[]
```

---

# 9. Freeze behavior

## 9.1 `frozen: true`

At `environment:ready`:

```ts
registry.freeze("browser-registry config frozen=true");
```

## 9.2 `freezeOnReady: true`

At `environment:ready`:

```ts
registry.freeze("browser-registry freezeOnReady");
```

## 9.3 `freezeOnFirstRun: true`

At `environment:beforeRun`:

```ts
if (!registry.isFrozen()) {
  registry.freeze("browser-registry freezeOnFirstRun");
}
```

## 9.4 Behavior matrix

| Config                   | Dynamic registration during authoring | Registration after first run |
| ------------------------ | ------------------------------------: | ---------------------------: |
| `frozen: true`           |                                    No |                           No |
| `freezeOnReady: true`    |                            Setup only |                           No |
| `freezeOnFirstRun: true` |                                   Yes |                           No |
| all false                |                                   Yes |                          Yes |

Recommended default for browser demo:

```ts
{
  frozen: false,
  freezeOnReady: false,
  freezeOnFirstRun: true,
  allowRuntimeRegistration: true,
  autoBindRegisteredExtensions: true,
}
```

---

# 10. Validation tests for dynamic registry

## 10.1 Dynamic extension appears in descriptor

```ts
it("describes dynamically registered extension", async () => {
  const env = createDynamicBrowserEnv();

  env.getRegistry().registerExtension(customerExtension);

  const descriptor = await env.describe();

  expect(descriptor.extensions.some(e => e.id === "@customer/image-tools")).toBe(true);
  expect(descriptor.capabilities.some(c => c.id === "@customer/image-tools.caption")).toBe(true);
});
```

## 10.2 Search finds dynamic capability

```ts
it("search finds dynamically registered capability", async () => {
  const env = createDynamicBrowserEnv();

  env.getRegistry().registerExtension(customerExtension);

  const result = await env.search("caption image");

  expect(result.results.some(r => r.id === "@customer/image-tools.caption")).toBe(true);
});
```

## 10.3 Freeze on first run

```ts
it("freezes registry before first run", async () => {
  const env = createDynamicBrowserEnv({
    freezeOnFirstRun: true,
  });

  env.getRegistry().registerExtension(customerExtension);

  await env.run(simpleWorkflow);

  expect(env.getRegistry().isFrozen()).toBe(true);

  expect(() => env.getRegistry().registerExtension(otherExtension))
    .toThrow(RegistryFrozenError);
});
```

## 10.4 Denied namespace

```ts
it("denies registration outside allowed namespace", () => {
  const env = createDynamicBrowserEnv({
    allowedNamespaces: ["@customer/*"],
  });

  expect(() => env.getRegistry().registerExtension(ecpExtension))
    .toThrow(RegistryRegistrationDeniedError);
});
```

## 10.5 Deny wins over allow

```ts
it("denied namespace wins over allowed namespace", () => {
  const env = createDynamicBrowserEnv({
    allowedNamespaces: ["@customer/*"],
    deniedNamespaces: ["@customer/unsafe"],
  });

  expect(() => env.getRegistry().registerExtension(unsafeCustomerExtension))
    .toThrow(RegistryRegistrationDeniedError);
});
```

## 10.6 Global registration

```ts
it("exposes browser global registration API", () => {
  const env = createDynamicBrowserEnv({
    exposeGlobal: true,
    globalName: "ECP",
  });

  globalThis.ECP.registerExtension(customerExtension);

  expect(env.getRegistry().getExtension("@customer/image-tools")).toBeDefined();
});
```

## 10.7 Shutdown removes global

```ts
it("removes global registration API on shutdown", async () => {
  const env = createDynamicBrowserEnv({
    exposeGlobal: true,
    globalName: "ECP",
  });

  expect(globalThis.ECP).toBeDefined();

  await env.shutdown();

  expect(globalThis.ECP).toBeUndefined();
});
```

---

# 11. Implementation sequencing for dynamic registry

## Step 1: Add registry frozen state

Implement:

```txt
registry.freeze()
registry.isFrozen()
RegistryFrozenError
```

Add tests.

## Step 2: Add registration guard

Implement:

```txt
RegistryRegistrationGuard
registry.setRegistrationGuard()
RegistryRegistrationDeniedError
```

Add namespace guard tests.

## Step 3: Add environment lifecycle events

Implement:

```txt
environment:configuring
environment:ready
environment:beforeRun
environment:shutdown
```

Add hook ordering tests.

## Step 4: Add browser registry extension

Implement hook-only extension.

Add tests for:

```txt
- attach guard
- freezeOnReady
- freezeOnFirstRun
- allowRuntimeRegistration
```

## Step 5: Add dynamic binding support

Implement:

```txt
autoBindRegisteredExtensions
Environment.addExtensionBinding()
descriptor/search refresh
```

Add tests.

## Step 6: Add global API

Implement:

```txt
exposeGlobal
globalName
detach on shutdown
```

Add browser tests.

## Step 7: Add browser demo fixture

Create simple dynamic extension loaded after environment creation.

Example:

```txt
packages/runtimes/browser/test/fixtures/customer-extension.ts
```

---

# 12. Open design choices to resolve before coding

## 12.1 Should `environment:ready` run before describe/search?

Recommendation: **No**.

Use:

| Method       | Runs `environment:configuring` | Runs `environment:ready` |
| ------------ | -----------------------------: | -----------------------: |
| `describe()` |                            Yes |                       No |
| `search()`   |                            Yes |                       No |
| `validate()` |                            Yes |                       No |
| `run()`      |                            Yes |                      Yes |

Reason: browser authoring needs dynamic registration during discovery/authoring. `environment:ready` may freeze in some configs.

## 12.2 Should auto-bind default to true?

Recommendation:

```txt
default false in package
true in browser demo setup
```

This is safer for production but convenient for demos.

## 12.3 Should registry support unfreeze?

Recommendation: **No for v1.**

Frozen should mean frozen.

## 12.4 Should dynamic policies/runtimes auto-bind?

Recommendation: **No.**

Only auto-bind extensions. Policies and runtimes should require explicit environment configuration.

---

# Final recommendation

Validate the implementation in this order:

1. **Core lifecycle + registry freeze**
2. **Shared runtime conformance**
3. **Browser runtime import and execution**
4. **`state()` transactional mutation behavior**
5. **Dynamic registry behavior**
6. **Browser config/session behavior**
7. **Node runtime + env/secrets migration**

Then implement dynamic browser extension registration with the smallest possible surface:

```txt
@executioncontrolprotocol/browser-registry
  hook-only extension
  config-driven frozen state
  dynamic registration guard
  optional global registration API
  optional auto-bind for dynamically registered extensions
  freeze-on-first-run for safe browser execution
```

That gives you a browser-native ECP runtime that can dynamically learn new extensions during authoring, then freeze before execution for safety.
