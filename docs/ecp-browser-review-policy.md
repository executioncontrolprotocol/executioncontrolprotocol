# ECP browser review — policy-governed registration

Yes, that is the right instinct.

Namespace validation for **dynamic extension registration** should be policy-governed, not hard-coded as extension config.

The browser registry extension should provide the **mechanism**:

```ts
allow dynamic extension registration
freeze registry
auto-bind registered extensions if configured
expose browser global if configured
```

A policy should provide the **authorization decision**:

```ts
is this extension namespace allowed?
is this extension trusted enough to register?
can it be auto-bound?
can it register before/after ready?
```

# Why policy is cleaner

The browser registry extension is infrastructure. It should not own governance rules like:

```ts
allowedNamespaces
deniedNamespaces
```

Those are security/authorization concerns, and they belong in policy.

So instead of this:

```ts
extension("@executioncontrolprotocol/browser-registry").with({
  allowedNamespaces: ["@customer/*"],
  deniedNamespaces: ["@unsafe/*"]
})
```

Prefer this:

```ts
extension("@executioncontrolprotocol/browser-registry").with({
  frozen: false,
  freezeOnFirstRun: true,
  allowRuntimeRegistration: true,
  autoBindRegisteredExtensions: true
})

policy("@executioncontrolprotocol/registry-control").with({
  allowedExtensionNamespaces: ["@customer/*"],
  deniedExtensionNamespaces: ["@unsafe/*"],
  allowAutoBind: true
})
```

# Do we have the right hooks?

Mostly yes, with one small addition.

The current lifecycle has `policy:pre`, `policy:post`, and `policy:finally`; policies already govern execution decisions in the core spec. The implementation plan also expanded policy context to inspect state mutations before commit, which proves the policy system can evaluate non-capability runtime actions when the runtime exposes the right context.

For dynamic registry, we need the same pattern:

> Dynamic registry registration should call the policy engine before the registry accepts the extension definition.

That does **not** require making policies dynamic. Policies are frozen in the environment. The browser registry extension asks the already-bound policy engine for a decision.

# Minimal hook model

Keep policies frozen and add a registry-specific policy evaluation point inside the environment/registry flow.

Conceptually:

```txt
browser script calls registerExtension(def)
↓
browser registry extension intercepts request
↓
runtime/environment evaluates frozen policies
↓
if allowed: registry.registerExtension(def)
if denied: throw REGISTRY_REGISTRATION_DENIED
```

This can reuse policy hooks, but it needs a policy context shape for registry operations.

# Recommended policy event approach

I would avoid adding broad `registry:*` public lifecycle hooks if we can. Instead, treat registry registration as an **environment policy check**.

Use existing policy hooks:

```ts
hook("policy:pre", validateDynamicRegistryRegistration)
```

But call it with a policy context like:

```ts
{
  scope: "environment",
  operation: "registry.registerExtension",
  registryRequest: {
    type: "extension",
    id: "@customer/image-tools",
    definition: extensionDefinition,
    autoBindRequested: true,
    source: {
      type: "browser-global",
      url: "...",
    }
  }
}
```

Then the policy can return:

```ts
{ type: "allow" }
```

or:

```ts
{
  type: "deny",
  reason: "Extension namespace is not allowed."
}
```

# Add one standard policy

Add a first-party policy:

```txt
@executioncontrolprotocol/registry-control
```

Config:

```ts
export interface RegistryControlPolicyConfig {
  allowedExtensionNamespaces?: string[];
  deniedExtensionNamespaces?: string[];
  allowDynamicExtensionRegistration?: boolean;
  allowAutoBind?: boolean;
  requireFrozenBeforeRun?: boolean;
}
```

Behavior:

| Hook             | Behavior                                                              |
| ---------------- | --------------------------------------------------------------------- |
| `policy:pre`     | Validate dynamic registration requests before they enter the registry |
| `policy:finally` | Record registration audit summary                                     |

I would not use `policy:post` for registration because the point is to prevent the registration before it happens.

# Browser registry extension config after this change

The extension config becomes operational only:

```ts
extension("@executioncontrolprotocol/browser-registry").with({
  frozen: false,
  freezeOnReady: false,
  freezeOnFirstRun: true,
  allowRuntimeRegistration: true,
  autoBindRegisteredExtensions: true,
  exposeGlobal: true,
  globalName: "ECP"
})
```

Remove from extension config:

```ts
allowedNamespaces
deniedNamespaces
```

Move those to:

```ts
policy("@executioncontrolprotocol/registry-control").with({
  allowedExtensionNamespaces: ["@customer/*"],
  deniedExtensionNamespaces: ["@customer/unsafe"],
  allowDynamicExtensionRegistration: true,
  allowAutoBind: true,
  requireFrozenBeforeRun: true
})
```

# Frozen policies rule

I agree with you:

> Only extensions should be dynamic. Policies should be frozen in the environment.

That means:

| Dynamic registration type |                     Should be allowed? |
| ------------------------- | -------------------------------------: |
| Extension definitions     | Yes, if registry-control policy allows |
| Policy definitions        |                                     No |
| Runtime definitions       |                          No by default |
| Extension auto-bind       |            Optional, policy-controlled |
| Policy auto-bind          |                                     No |
| Runtime replacement       |                                     No |

The browser global should probably expose only:

```ts
window.ECP.registerExtension(def)
window.ECP.freezeRegistry()
window.ECP.isRegistryFrozen()
```

Not:

```ts
window.ECP.registerPolicy(...)
window.ECP.registerRuntime(...)
```

That is a correction to the earlier plan.

# Updated source-of-truth rule

Merge this:

> `@executioncontrolprotocol/browser-registry` provides the dynamic registration mechanism. It does not decide namespace authorization. Dynamic extension registration must be evaluated by frozen environment policies before registration. `@executioncontrolprotocol/registry-control` governs allowed/denied extension namespaces, auto-bind permission, and whether the registry must freeze before execution. Policies and runtimes are not dynamically registered in browser environments.

This is cleaner, safer, and more aligned with ECP’s policy model.
