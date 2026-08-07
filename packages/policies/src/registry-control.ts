import type { PolicyContext } from "@executioncontrolprotocol/core"
import type { PolicyDecision } from "@executioncontrolprotocol/types"
import { definePolicy, globalRegistry, hook, matchesAnyNamespace } from "@executioncontrolprotocol/core"
import { z } from "zod"

type PolicyHookFn = (
  ctx: PolicyContext & { config: Record<string, unknown> }
) => PolicyDecision | void | Promise<PolicyDecision | void>

function policyHook(
  event: import("@executioncontrolprotocol/types").PolicyLifecycleEvent,
  fn: PolicyHookFn
) {
  return hook(event, (lifecycleCtx) =>
    fn(lifecycleCtx as unknown as PolicyContext & { config: Record<string, unknown> })
  )
}

/** Config for `@executioncontrolprotocol/registry-control`. @category Policies */
export interface RegistryControlPolicyConfig {
  /** Allowed extension namespace patterns. */
  allowedExtensionNamespaces?: string[]
  /** Denied extension namespace patterns (wins over allow). */
  deniedExtensionNamespaces?: string[]
  /** Whether dynamic extension registration is permitted. */
  allowDynamicExtensionRegistration?: boolean
  /** Whether auto-bind after registration is permitted. */
  allowAutoBind?: boolean
}

const POLICY_ID = "@executioncontrolprotocol/registry-control"

/** @executioncontrolprotocol/registry-control — governs dynamic extension registration. @category Policies */
export const registryControlPolicy = definePolicy("@executioncontrolprotocol", "registry-control")
  .withConfig({
    allowedExtensionNamespaces: z.array(z.string()).optional(),
    deniedExtensionNamespaces: z.array(z.string()).default([]),
    allowDynamicExtensionRegistration: z.boolean().default(true),
    allowAutoBind: z.boolean().default(true),
  })
  .withHooks([
    policyHook("policy:pre", (ctx) => {
      const req = ctx.registryRequest
      if (!req) return { type: "allow" }

      if (req.kind !== "extension") {
        return {
          type: "deny",
          reason: "Dynamic policy and runtime registration is not allowed",
          code: "REGISTRY_KIND_DENIED",
        }
      }

      const allowDynamic = ctx.config.allowDynamicExtensionRegistration !== false
      if (!allowDynamic) {
        return {
          type: "deny",
          reason: "Dynamic extension registration is disabled",
          code: "REGISTRY_DYNAMIC_DISABLED",
        }
      }

      if (req.autoBindRequested && ctx.config.allowAutoBind === false) {
        return {
          type: "deny",
          reason: "Auto-bind after registration is not allowed",
          code: "REGISTRY_AUTOBIND_DENIED",
        }
      }

      const denied = (ctx.config.deniedExtensionNamespaces as string[] | undefined) ?? []
      if (denied.length > 0 && matchesAnyNamespace(req.id, denied)) {
        return {
          type: "deny",
          reason: `Extension namespace is denied: ${req.id}`,
          code: "REGISTRY_NAMESPACE_DENIED",
        }
      }

      const allowed = ctx.config.allowedExtensionNamespaces as string[] | undefined
      if (allowed && allowed.length > 0 && !matchesAnyNamespace(req.id, allowed)) {
        return {
          type: "deny",
          reason: `Extension namespace is not allowed: ${req.id}`,
          code: "REGISTRY_NAMESPACE_NOT_ALLOWED",
        }
      }

      return { type: "allow" }
    }),
  ])
  .build()

export { POLICY_ID as REGISTRY_CONTROL_POLICY_ID }

/** Register `@executioncontrolprotocol/registry-control` on the global registry. */
export async function registerRegistryControlPolicy(registry = globalRegistry): Promise<void> {
  if (!registry.getPolicy(POLICY_ID)) {
    await registry.registerPolicy(registryControlPolicy)
  }
}
