import {
  defineExtension,
  hook,
  globalRegistry,
  RegistryRegistrationDeniedError,
  type Environment,
  type EnvironmentLifecycleHost,
  type ExtensionDefinition,
  type LifecycleContext,
} from "@executioncontrolprotocol/core"
import type { RegistryRegistrationRequest } from "@executioncontrolprotocol/types"
import { z } from "zod"

const EXT_ID = "@executioncontrolprotocol/browser-registry"

/** Browser global registration surface. @category Extensions */
export interface BrowserEcpGlobal {
  /** Active environment when browser-registry is configured. */
  getEnvironment(): Environment | undefined
  /** Register an extension definition (policy-governed). */
  registerExtension(def: ExtensionDefinition): Promise<void>
  /** Freeze the environment registry. */
  freezeRegistry(reason?: string): void
  /** Whether the registry rejects new registrations. */
  isRegistryFrozen(): boolean
}

let activeHost: EnvironmentLifecycleHost | undefined
let globalApi: BrowserEcpGlobal | undefined
let attachedGlobalName: string | undefined

function getExtensionConfig(ctx: LifecycleContext): Record<string, unknown> {
  return (ctx as LifecycleContext & { extensionConfig?: Record<string, unknown> })
    .extensionConfig ?? {}
}

function attachBrowserRegistry(ctx: LifecycleContext): void {
  const host = ctx.environment
  if (!host?.evaluateRegistryRegistration) return
  activeHost = host
  const cfg = getExtensionConfig(ctx)
  const registry = host.getRegistry()
  const allowReg = cfg.allowRuntimeRegistration !== false

  registry.setRegistrationGuard(async (request: RegistryRegistrationRequest) => {
    if (request.kind !== "extension") {
      throw new RegistryRegistrationDeniedError(
        request.id,
        "Dynamic policy/runtime registration is not allowed"
      )
    }
    if (!allowReg) {
      throw new Error("Runtime registration disabled")
    }
    await host.evaluateRegistryRegistration!({
      ...request,
      autoBindRequested: cfg.autoBindRegisteredExtensions === true,
    })
  })

  if (cfg.exposeGlobal === true && typeof globalThis !== "undefined") {
    const globalName = (cfg.globalName as string | undefined) ?? "ecp"
    const env = host as Environment
    const api: BrowserEcpGlobal = {
      getEnvironment: () => env,
      async registerExtension(def) {
        if (!allowReg) throw new Error("Runtime registration disabled")
        await registry.registerExtension(def, {
          source: { type: "browser-global" },
          autoBindRequested: cfg.autoBindRegisteredExtensions === true,
        })
        if (cfg.autoBindRegisteredExtensions === true) {
          env.addExtensionBinding(def.id, {})
        }
      },
      freezeRegistry: (r) => registry.freeze(r),
      isRegistryFrozen: () => registry.isFrozen(),
    }
    globalApi = api
    attachedGlobalName = globalName
    ;(globalThis as Record<string, unknown>)[globalName] = api
  }
}

function maybeFreezeOn(ctx: LifecycleContext, hook: string): void {
  const cfg = getExtensionConfig(ctx)
  const registry = ctx.environment?.getRegistry()
  if (!registry || registry.isFrozen()) return
  if (cfg.freezeOn === hook) {
    registry.freeze(hook)
  }
}

function detachBrowserRegistry(ctx: LifecycleContext): void {
  const cfg = getExtensionConfig(ctx)
  if (
    cfg.exposeGlobal === true &&
    attachedGlobalName &&
    typeof globalThis !== "undefined"
  ) {
    const g = globalThis as Record<string, unknown>
    if (g[attachedGlobalName] === globalApi) {
      delete g[attachedGlobalName]
    }
  }
  ctx.environment?.getRegistry().setRegistrationGuard(undefined)
  activeHost = undefined
  globalApi = undefined
  attachedGlobalName = undefined
}

/** Expose browser global registry API when configured. */
export function exposeBrowserRegistry(): BrowserEcpGlobal | undefined {
  return globalApi
}

/** Hook-only dynamic registry extension for browser. @category Extensions */
export const browserRegistryExtension = defineExtension("@executioncontrolprotocol", "browser-registry")
  .withConfig({
    freezeOn: z.string().default("environment:beforeRun"),
    allowRuntimeRegistration: z.boolean().default(true),
    autoBindRegisteredExtensions: z.boolean().default(false),
    exposeGlobal: z.boolean().default(false),
    globalName: z.string().default("ecp"),
  })
  .withHooks([
    hook("environment:configuring", attachBrowserRegistry),
    hook("environment:ready", (ctx) => maybeFreezeOn(ctx, "environment:ready")),
    hook("environment:beforeRun", (ctx) => maybeFreezeOn(ctx, "environment:beforeRun")),
    hook("environment:terminate", detachBrowserRegistry),
  ])
  .build()

/** Register `@executioncontrolprotocol/browser-registry`. */
export async function registerBrowserRegistryExtension(registry = globalRegistry): Promise<void> {
  if (!registry.getExtension(EXT_ID)) {
    await registry.registerExtension(browserRegistryExtension)
  }
}

/** Active environment host when registry extension is attached. */
export function getActiveBrowserEnvironmentHost(): EnvironmentLifecycleHost | undefined {
  return activeHost
}
